import type {
    CatalogEntry,
    CatalogEntryStatus,
    InstalledPluginSnapshot,
    ManagedPluginAvailability,
    ManagedPluginRecommendation,
    ManagedPluginTrust,
} from "./types";
import { getCatalogEntryStatus } from "./status";
import { filterCatalogEntries } from "./validation";

export type CatalogViewItem = CatalogEntry & {
    managed: boolean;
    managedTrust?: ManagedPluginTrust;
    managedAvailability?: ManagedPluginAvailability;
    status: CatalogEntryStatus;
};

export function createManagedCatalogEntry(
    recommendation: ManagedPluginRecommendation,
): CatalogEntry {
    return {
        id: `managed-plugin:${recommendation.platform}`,
        name: recommendation.platform,
        version: recommendation.version ?? "Unavailable",
        url: `managed-plugin:${encodeURIComponent(recommendation.platform)}`,
        host: recommendation.trust === "community" ? "Community" : "MyMusic",
    };
}

export function buildCatalogViewItems(
    entries: CatalogEntry[],
    installedPlugins: InstalledPluginSnapshot[],
    query: string,
    recommendations: readonly ManagedPluginRecommendation[] = [],
): CatalogViewItem[] {
    const managedByName = new Map(
        recommendations.map(item => [item.platform, item] as const),
    );
    const managedEntries = recommendations.map(createManagedCatalogEntry);
    const remoteEntries = entries.filter(entry => !managedByName.has(entry.name));

    return filterCatalogEntries(
        [...managedEntries, ...remoteEntries],
        query,
    ).map(entry => {
        const recommendation = managedByName.get(entry.name);

        return {
            ...entry,
            managed: recommendation !== undefined,
            ...(recommendation === undefined ? {} : {
                managedTrust: recommendation.trust,
                managedAvailability: recommendation.availability,
            }),
            status: recommendation?.availability === "unavailable"
                ? "unavailable"
                : getCatalogEntryStatus(entry, installedPlugins),
        };
    });
}
