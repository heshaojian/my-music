import type {
    CatalogEntry,
    CatalogEntryStatus,
    InstalledPluginSnapshot,
} from "./types";
import { getCatalogEntryStatus } from "./status";
import { filterCatalogEntries } from "./validation";

export type CatalogViewItem = CatalogEntry & {
    status: CatalogEntryStatus;
};

export function buildCatalogViewItems(
    entries: CatalogEntry[],
    installedPlugins: InstalledPluginSnapshot[],
    query: string,
): CatalogViewItem[] {
    return filterCatalogEntries(entries, query).map(entry => ({
        ...entry,
        status: getCatalogEntryStatus(entry, installedPlugins),
    }));
}
