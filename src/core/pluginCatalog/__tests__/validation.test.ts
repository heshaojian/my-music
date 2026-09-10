import {
    MAX_CATALOG_BYTES,
    OFFICIAL_PLUGIN_CATALOG,
} from "@/core/pluginCatalog/constants";
import {
    filterCatalogEntries,
    parseCatalogManifest,
} from "@/core/pluginCatalog/validation";

const plugin = (overrides: Record<string, unknown> = {}) => ({
    name: "Audiomack",
    version: "0.0.2",
    url: "https://plugins.example.com/audiomack.js",
    ...overrides,
});

describe("plugin catalog validation", () => {
    it("accepts and normalizes the official manifest shape", () => {
        const entries = parseCatalogManifest(JSON.stringify({
            desc: "ignored",
            plugins: [plugin({ url: "https://PLUGINS.example.com:443/audiomack.js#latest" })],
        }));

        expect(entries).toEqual([{
            id: "https://plugins.example.com/audiomack.js",
            name: "Audiomack",
            version: "0.0.2",
            url: "https://plugins.example.com/audiomack.js",
            host: "plugins.example.com",
        }]);
    });

    it.each([
        "http://plugins.example.com/a.js",
        "file:///tmp/a.js",
        "https://user:password@plugins.example.com/a.js",
        "not-a-url",
    ])("rejects an unsafe plugin URL: %s", url => {
        expect(() => parseCatalogManifest(JSON.stringify({
            plugins: [plugin({ url })],
        }))).toThrow("valid plugins");
    });

    it("keeps valid entries when sibling entries are malformed", () => {
        const entries = parseCatalogManifest(JSON.stringify({
            plugins: [
                plugin(),
                plugin({ name: "", url: "https://plugins.example.com/b.js" }),
                plugin({ name: "Bad version", version: "latest", url: "https://plugins.example.com/c.js" }),
            ],
        }));

        expect(entries).toHaveLength(1);
        expect(entries[0].name).toBe("Audiomack");
    });

    it("deduplicates by canonical URL and normalized name", () => {
        const entries = parseCatalogManifest(JSON.stringify({
            plugins: [
                plugin(),
                plugin({ name: "Duplicate URL", url: "https://plugins.example.com/audiomack.js#copy" }),
                plugin({ name: " audiomack ", url: "https://plugins.example.com/other.js" }),
            ],
        }));

        expect(entries).toHaveLength(1);
        expect(entries[0].name).toBe("Audiomack");
    });

    it("accepts an explicitly empty catalog", () => {
        expect(parseCatalogManifest("{\"plugins\":[]}")).toEqual([]);
    });

    it("rejects invalid structure, excessive entries, and oversized bodies", () => {
        expect(() => parseCatalogManifest("[]")).toThrow("manifest");
        expect(() => parseCatalogManifest(JSON.stringify({
            plugins: Array.from({ length: 101 }, (_, index) => plugin({
                name: `Plugin ${index}`,
                url: `https://plugins.example.com/${index}.js`,
            })),
        }))).toThrow("entries");
        expect(() => parseCatalogManifest("x".repeat(MAX_CATALOG_BYTES + 1))).toThrow("large");
    });

    it("filters locally by name or host", () => {
        const entries = parseCatalogManifest(JSON.stringify({
            plugins: [
                plugin(),
                plugin({ name: "Navidrome", url: "https://music.example.net/navidrome.js" }),
            ],
        }));

        expect(filterCatalogEntries(entries, "NAVIDROME")).toHaveLength(1);
        expect(filterCatalogEntries(entries, "example.com")[0].name).toBe("Audiomack");
        expect(filterCatalogEntries(entries, "  ")).toEqual(entries);
    });

    it("defines the approved official HTTPS source", () => {
        expect(OFFICIAL_PLUGIN_CATALOG).toMatchObject({
            id: "musicfree-official",
            trust: "official",
            manifestUrl: "https://raw.githubusercontent.com/maotoumao/MusicFreePlugins/master/plugins.json",
        });
    });
});
