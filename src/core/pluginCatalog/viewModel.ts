import type {
    CatalogEntry,
    CatalogEntryStatus,
    InstalledPluginSnapshot,
} from "./types";
import { getCatalogEntryStatus } from "./status";
import { filterCatalogEntries } from "./validation";

export type CatalogViewItem = CatalogEntry & {
    managed: boolean;
    status: CatalogEntryStatus;
};

export function buildCatalogViewItems(
    entries: CatalogEntry[],
    installedPlugins: InstalledPluginSnapshot[],
    query: string,
    isManagedPlugin: (platform: string) => boolean = () => false,
): CatalogViewItem[] {
    return filterCatalogEntries(entries, query).map(entry => ({
        ...entry,
        managed: isManagedPlugin(entry.name),
        status: getCatalogEntryStatus(entry, installedPlugins),
    }));
}
