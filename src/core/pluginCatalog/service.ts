import { MAX_CATALOG_BYTES, OFFICIAL_PLUGIN_CATALOG } from "./constants";
import type {
    CatalogCacheRecord,
    CatalogEntry,
    CatalogInstaller,
    CatalogLoadResult,
    CatalogTransport,
    CatalogCache,
} from "./types";
import { normalizeHttpsUrl, parseCatalogManifest } from "./validation";
import { createManagedCatalogEntry } from "./viewModel";

interface PluginCatalogDependencies {
    transport: CatalogTransport;
    cache: CatalogCache;
    installer: CatalogInstaller;
    now: () => number;
}

const REFRESH_ERROR = "Unable to refresh the plugin catalog";
const MANAGED_RESTORE_ERROR = "Unable to restore recommended plugin";

function normalizeCacheRecord(record: CatalogCacheRecord | null) {
    if (
        !record ||
        record.schemaVersion !== 1 ||
        record.sourceId !== OFFICIAL_PLUGIN_CATALOG.id ||
        !Number.isFinite(record.fetchedAt)
    ) {
        return null;
    }
    try {
        const entries = parseCatalogManifest(JSON.stringify({
            plugins: record.entries,
        }));
        return { ...record, entries };
    } catch {
        return null;
    }
}

export function createPluginCatalogService(
    dependencies: PluginCatalogDependencies,
) {
    let currentEntries: CatalogEntry[] = [];
    let managedReconciliation: Promise<Record<string, string>> | null = null;

    const getManagedPluginRecommendations = () =>
        dependencies.installer.getManagedPluginRecommendations().map(item => ({
            ...item,
        }));

    const readCacheRecord = () =>
        normalizeCacheRecord(
            dependencies.cache.read(OFFICIAL_PLUGIN_CATALOG.id),
        );

    const readCached = (): CatalogLoadResult | null => {
        const record = readCacheRecord();
        if (!record) {
            return null;
        }
        currentEntries = [...record.entries];
        return {
            entries: [...record.entries],
            fetchedAt: record.fetchedAt,
            stale: false,
        };
    };

    const staleResult = (): CatalogLoadResult => {
        const record = readCacheRecord();
        if (!record) {
            return { entries: [], stale: false, error: REFRESH_ERROR };
        }
        currentEntries = [...record.entries];
        return {
            entries: [...record.entries],
            fetchedAt: record.fetchedAt,
            stale: true,
            error: REFRESH_ERROR,
        };
    };

    return {
        readCached,
        async refresh(): Promise<CatalogLoadResult> {
            try {
                const response = await dependencies.transport.getText(
                    OFFICIAL_PLUGIN_CATALOG.manifestUrl,
                    MAX_CATALOG_BYTES,
                );
                if (response.finalUrl) {
                    normalizeHttpsUrl(response.finalUrl);
                }
                const entries = parseCatalogManifest(response.text);
                const record: CatalogCacheRecord = {
                    schemaVersion: 1,
                    sourceId: OFFICIAL_PLUGIN_CATALOG.id,
                    fetchedAt: dependencies.now(),
                    entries,
                };
                dependencies.cache.write(record);
                currentEntries = [...entries];
                return {
                    entries: [...entries],
                    fetchedAt: record.fetchedAt,
                    stale: false,
                };
            } catch {
                return staleResult();
            }
        },
        async install(entry: CatalogEntry) {
            const approvedManagedEntry = getManagedPluginRecommendations()
                .map(createManagedCatalogEntry)
                .find(candidate =>
                    candidate.id === entry.id &&
                    candidate.name === entry.name &&
                    candidate.version === entry.version &&
                    candidate.host === entry.host &&
                    candidate.url === entry.url,
                );
            if (approvedManagedEntry) {
                try {
                    const result = await dependencies.installer
                        .repairManagedPlugin(approvedManagedEntry.name);
                    if (result.success) {
                        return result;
                    }
                } catch {
                    // Managed retry errors are reduced to provider-scoped UI
                    // state and must not expose paths, signed URLs, or tokens.
                }
                return {
                    success: false,
                    message: MANAGED_RESTORE_ERROR,
                };
            }
            if (currentEntries.length === 0) {
                currentEntries = readCacheRecord()?.entries ?? [];
            }
            const approvedEntry = currentEntries.find(
                candidate => candidate.id === entry.id && candidate.url === entry.url,
            );
            if (!approvedEntry) {
                return {
                    success: false,
                    message: "Plugin is not in the validated catalog",
                };
            }
            if (dependencies.installer.isManagedPlugin(approvedEntry.name)) {
                return {
                    success: false,
                    message: "Managed plugins use bundled recommendations",
                };
            }
            return dependencies.installer.installPluginFromUrl(approvedEntry.url);
        },
        getInstalledPlugins: () => [
            ...dependencies.installer.getInstalledPlugins(),
        ],
        isManagedPlugin: (platform: string) =>
            dependencies.installer.isManagedPlugin(platform),
        getManagedPluginRecommendations,
        reconcileManagedRecommendations() {
            if (managedReconciliation) {
                return managedReconciliation;
            }
            managedReconciliation = (async () => {
                const failures: Record<string, string> = {};
                for (const recommendation of getManagedPluginRecommendations()) {
                    try {
                        const result = await dependencies.installer
                            .repairManagedPlugin(recommendation.platform);
                        if (result.success) {
                            continue;
                        }
                    } catch {
                        // Managed repair errors are intentionally reduced to
                        // provider-scoped state below.
                    }
                    if (!failures[recommendation.platform]) {
                        failures[recommendation.platform] = MANAGED_RESTORE_ERROR;
                    }
                }
                return failures;
            })().finally(() => {
                managedReconciliation = null;
            });
            return managedReconciliation;
        },
    };
}
