import type {
    CatalogEntry,
    CatalogEntryStatus,
    InstalledPluginSnapshot,
    ManagedPluginRecommendation,
} from "./types";
import { getCatalogEntryStatus } from "./status";
import { filterCatalogEntries } from "./validation";

export type CatalogViewItem = CatalogEntry & {
    managed: boolean;
    status: CatalogEntryStatus;
};

export function createManagedCatalogEntry(
    recommendation: ManagedPluginRecommendation,
): CatalogEntry {
    return {
        id: `managed-plugin:${recommendation.platform}`,
        name: recommendation.platform,
        version: recommendation.version,
        url: `managed-plugin:${encodeURIComponent(recommendation.platform)}`,
        host: "MyMusic",
    };
}

export function buildCatalogViewItems(
    entries: CatalogEntry[],
    installedPlugins: InstalledPluginSnapshot[],
    query: string,
    recommendations: readonly ManagedPluginRecommendation[] = [],
): CatalogViewItem[] {
    const managedNames = new Set(recommendations.map(item => item.platform));
    const managedEntries = recommendations.map(createManagedCatalogEntry);
    const remoteEntries = entries.filter(entry => !managedNames.has(entry.name));

    return filterCatalogEntries(
        [...managedEntries, ...remoteEntries],
        query,
    ).map(entry => ({
        ...entry,
        managed: managedNames.has(entry.name),
        status: getCatalogEntryStatus(entry, installedPlugins),
    }));
}
