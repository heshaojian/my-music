import {
    createCatalogCache,
    createCatalogTransport,
} from "@/core/pluginCatalog/adapters";
import type { CatalogCacheRecord } from "@/core/pluginCatalog/types";

const record: CatalogCacheRecord = {
    schemaVersion: 1,
    sourceId: "musicfree-official",
    fetchedAt: 123,
    entries: [],
};

describe("plugin catalog adapters", () => {
    it("rejects non-HTTPS catalog request URLs before fetching", async () => {
        const get = jest.fn();
        const transport = createCatalogTransport({ get });

        await expect(transport.getText("http://catalog.example.com/plugins.json", 100))
            .rejects.toThrow("Invalid URL");
        expect(get).not.toHaveBeenCalled();
    });

    it("fetches catalog text with transport limits and returns the final URL", async () => {
        const get = jest.fn(async () => ({
            data: "{\"plugins\":[]}",
            headers: { "content-length": "14" },
            request: { responseURL: "https://catalog.example.com/plugins.json" },
        }));
        const transport = createCatalogTransport({ get });

        await expect(transport.getText("https://catalog.example.com/plugins.json", 100)).resolves.toEqual({
            text: "{\"plugins\":[]}",
            finalUrl: "https://catalog.example.com/plugins.json",
        });
        expect(get).toHaveBeenCalledWith(
            "https://catalog.example.com/plugins.json",
            expect.objectContaining({
                responseType: "text",
                maxContentLength: 100,
                maxBodyLength: 100,
                signal: expect.anything(),
                onDownloadProgress: expect.any(Function),
            }),
        );
    });

    it("rejects declared and actual oversized responses", async () => {
        const declaredTransport = createCatalogTransport({
            get: jest.fn(async () => ({
                data: "private plugin source",
                headers: { "content-length": "101" },
            })),
        });
        await expect(declaredTransport.getText("https://example.com/catalog.json", 100))
            .rejects.toThrow("too large");

        const actualTransport = createCatalogTransport({
            get: jest.fn(async () => ({ data: "x".repeat(101), headers: {} })),
        });
        await expect(actualTransport.getText("https://example.com/catalog.json", 100))
            .rejects.toThrow("too large");
    });

    it("aborts the request as soon as download progress exceeds the limit", async () => {
        let capturedSignal: AbortSignal | undefined;
        const get = jest.fn(async (_url: string, config: Record<string, any>) => {
            capturedSignal = config.signal;
            config.onDownloadProgress({ loaded: 101 });
            throw new Error("aborted");
        });
        const transport = createCatalogTransport({ get });

        await expect(transport.getText("https://example.com/catalog.json", 100))
            .rejects.toThrow("aborted");
        expect(capturedSignal?.aborted).toBe(true);
    });

    it("reads and writes versioned cache records", () => {
        const values = new Map<string, string>();
        const store = {
            getString: jest.fn((key: string) => values.get(key)),
            set: jest.fn((key: string, value: string) => values.set(key, value)),
        };
        const cache = createCatalogCache(store);

        expect(cache.read(record.sourceId)).toBeNull();
        cache.write(record);
        expect(cache.read(record.sourceId)).toEqual(record);
    });

    it("ignores malformed cache data", () => {
        const cache = createCatalogCache({
            getString: jest.fn(() => "not-json"),
            set: jest.fn(),
        });

        expect(cache.read(record.sourceId)).toBeNull();
    });
});
