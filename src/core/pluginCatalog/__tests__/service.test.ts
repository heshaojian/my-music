import { createPluginCatalogService } from "@/core/pluginCatalog/service";
import { OFFICIAL_PLUGIN_CATALOG } from "@/core/pluginCatalog/constants";
import type { CatalogCacheRecord, CatalogEntry } from "@/core/pluginCatalog/types";

const entry: CatalogEntry = {
    id: "https://plugins.example.com/a.js",
    name: "Example",
    version: "1.0.0",
    url: "https://plugins.example.com/a.js",
    host: "plugins.example.com",
};

const cachedRecord: CatalogCacheRecord = {
    schemaVersion: 1,
    sourceId: OFFICIAL_PLUGIN_CATALOG.id,
    fetchedAt: 100,
    entries: [entry],
};

function createDependencies() {
    return {
        transport: {
            getText: jest.fn(async () => ({
                text: JSON.stringify({ plugins: [entry] }),
                finalUrl: OFFICIAL_PLUGIN_CATALOG.manifestUrl,
            })),
        },
        cache: {
            read: jest.fn((): CatalogCacheRecord | null => cachedRecord),
            write: jest.fn(),
        },
        installer: {
            installPluginFromUrl: jest.fn(async () => ({ success: true })),
            getInstalledPlugins: jest.fn(() => []),
        },
        now: jest.fn(() => 200),
    };
}

describe("plugin catalog service", () => {
    it("returns a valid cached catalog before refresh", () => {
        const dependencies = createDependencies();
        const service = createPluginCatalogService(dependencies);

        expect(service.readCached()).toEqual({
            entries: [entry],
            fetchedAt: 100,
            stale: false,
        });
    });

    it.each([
        { ...cachedRecord, schemaVersion: 2 },
        { ...cachedRecord, sourceId: "unknown" },
        { ...cachedRecord, fetchedAt: Number.NaN },
        { ...cachedRecord, entries: [{ ...entry, url: "http://unsafe.test/a.js" }] },
    ])("ignores invalid cache records", invalidRecord => {
        const dependencies = createDependencies();
        dependencies.cache.read.mockReturnValue(invalidRecord as CatalogCacheRecord);
        const service = createPluginCatalogService(dependencies);

        expect(service.readCached()).toBeNull();
    });

    it("refreshes and caches a validated manifest", async () => {
        const dependencies = createDependencies();
        const service = createPluginCatalogService(dependencies);

        const result = await service.refresh();

        expect(result.entries).toEqual([entry]);
        expect(result.stale).toBe(false);
        expect(dependencies.cache.write).toHaveBeenCalledWith({
            ...cachedRecord,
            fetchedAt: 200,
        });
    });

    it("uses stale cache when refresh fails", async () => {
        const dependencies = createDependencies();
        dependencies.transport.getText.mockRejectedValueOnce(new Error("offline"));
        const service = createPluginCatalogService(dependencies);

        await expect(service.refresh()).resolves.toEqual({
            entries: [entry],
            fetchedAt: 100,
            stale: true,
            error: "Unable to refresh the plugin catalog",
        });
        expect(dependencies.cache.write).not.toHaveBeenCalled();
    });

    it("returns an actionable error when refresh fails without cache", async () => {
        const dependencies = createDependencies();
        dependencies.cache.read.mockReturnValue(null);
        dependencies.transport.getText.mockRejectedValueOnce(new Error("private response body"));
        const service = createPluginCatalogService(dependencies);

        await expect(service.refresh()).resolves.toEqual({
            entries: [],
            stale: false,
            error: "Unable to refresh the plugin catalog",
        });
    });

    it("does not replace cache after an insecure redirect", async () => {
        const dependencies = createDependencies();
        dependencies.transport.getText.mockResolvedValueOnce({
            text: "{\"plugins\":[]}",
            finalUrl: "http://plugins.example.com/catalog.json",
        });
        const service = createPluginCatalogService(dependencies);

        const result = await service.refresh();

        expect(result.stale).toBe(true);
        expect(dependencies.cache.write).not.toHaveBeenCalled();
    });

    it("delegates installation using only a validated catalog entry", async () => {
        const dependencies = createDependencies();
        const service = createPluginCatalogService(dependencies);

        await expect(service.install(entry)).resolves.toEqual({ success: true });
        expect(dependencies.installer.installPluginFromUrl).toHaveBeenCalledWith(entry.url);
    });

    it("rejects installation of an entry not present in the current catalog", async () => {
        const dependencies = createDependencies();
        dependencies.cache.read.mockReturnValue(null);
        const service = createPluginCatalogService(dependencies);

        await expect(service.install(entry)).resolves.toMatchObject({ success: false });
        expect(dependencies.installer.installPluginFromUrl).not.toHaveBeenCalled();
    });
});
