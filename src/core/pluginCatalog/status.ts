import { compare, validate } from "compare-versions";
import type {
    CatalogEntry,
    CatalogEntryStatus,
    InstalledPluginSnapshot,
} from "./types";
import { normalizeHttpsUrl } from "./validation";

function canonicalInstalledUrl(value?: string): string | undefined {
    if (!value) {
        return undefined;
    }
    try {
        return normalizeHttpsUrl(value).toString();
    } catch {
        return undefined;
    }
}

export function getCatalogEntryStatus(
    entry: CatalogEntry,
    installedPlugins: InstalledPluginSnapshot[],
): CatalogEntryStatus {
    const installed = installedPlugins.find(plugin =>
        plugin.name.toLocaleLowerCase("en-US") ===
            entry.name.toLocaleLowerCase("en-US") ||
        canonicalInstalledUrl(plugin.srcUrl) === entry.url,
    );
    if (!installed) {
        return "available";
    }
    if (
        !installed.version ||
        !validate(installed.version) ||
        compare(entry.version, installed.version, "<=")
    ) {
        return "installed";
    }
    return "update";
}
