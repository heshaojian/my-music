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

interface PluginCatalogDependencies {
    transport: CatalogTransport;
    cache: CatalogCache;
    installer: CatalogInstaller;
    now: () => number;
}

const REFRESH_ERROR = "Unable to refresh the plugin catalog";

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
                return dependencies.installer.repairManagedPlugin(
                    approvedEntry.name,
                );
            }
            return dependencies.installer.installPluginFromUrl(approvedEntry.url);
        },
        getInstalledPlugins: () => [
            ...dependencies.installer.getInstalledPlugins(),
        ],
        isManagedPlugin: (platform: string) =>
            dependencies.installer.isManagedPlugin(platform),
    };
}
