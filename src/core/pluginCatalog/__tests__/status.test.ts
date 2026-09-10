import { getCatalogEntryStatus } from "@/core/pluginCatalog/status";
import type { CatalogEntry, InstalledPluginSnapshot } from "@/core/pluginCatalog/types";

const entry: CatalogEntry = {
    id: "https://plugins.example.com/a.js",
    name: "Example",
    version: "1.2.0",
    url: "https://plugins.example.com/a.js",
    host: "plugins.example.com",
};

describe("plugin catalog status", () => {
    it("reports available when the plugin is not installed", () => {
        expect(getCatalogEntryStatus(entry, [])).toBe("available");
    });

    it("reports installed for the same or a newer local version", () => {
        const installed: InstalledPluginSnapshot[] = [{ name: "Example", version: "1.2.0" }];
        expect(getCatalogEntryStatus(entry, installed)).toBe("installed");
        expect(getCatalogEntryStatus(entry, [{ name: "Example", version: "2.0.0" }])).toBe("installed");
    });

    it("reports update only for a valid older local version", () => {
        expect(getCatalogEntryStatus(entry, [{ name: "Example", version: "1.1.0" }])).toBe("update");
        expect(getCatalogEntryStatus(entry, [{ name: "Example", version: "unknown" }])).toBe("installed");
    });

    it("matches installed plugins by canonical source URL", () => {
        expect(getCatalogEntryStatus(entry, [{
            name: "Renamed",
            version: "1.0.0",
            srcUrl: "https://plugins.example.com/a.js#old",
        }])).toBe("update");
    });
});
