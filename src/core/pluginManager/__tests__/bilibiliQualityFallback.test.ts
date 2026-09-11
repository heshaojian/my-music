import {
    resolveWithBilibiliQualityFallback,
} from "../bilibiliQualityFallback";
import {
    filterProviderMediaSourceCache,
    shouldPersistProviderMediaSource,
} from "../providerMediaSourceCachePolicy";

const secureSource = (quality: IMusic.IQualityKey) => ({
    url: `https://media.example.com/${quality}.m4s?deadline=123`,
    headers: { Referer: "https://www.bilibili.com/" },
});

describe("provider media-source cache and Bilibili quality fallback", () => {
    it("does not persist temporary managed-provider media sources", () => {
        expect(shouldPersistProviderMediaSource("bilibili")).toBe(false);
        expect(shouldPersistProviderMediaSource("Audiomack")).toBe(false);
        expect(shouldPersistProviderMediaSource("Youtube")).toBe(false);
        expect(shouldPersistProviderMediaSource("audiomack")).toBe(true);
        expect(shouldPersistProviderMediaSource("youtube")).toBe(true);
        expect(shouldPersistProviderMediaSource("Youtube mirror")).toBe(true);
        expect(shouldPersistProviderMediaSource("Audiomack mirror")).toBe(true);
        expect(shouldPersistProviderMediaSource("another provider")).toBe(true);
    });

    it("removes and ignores legacy Bilibili media-source cache", () => {
        const cached = { source: { super: secureSource("super") } };
        const remove = jest.fn();

        expect(filterProviderMediaSourceCache(
            "bilibili",
            cached,
            remove,
        )).toBeNull();
        expect(remove).toHaveBeenCalledTimes(1);
        expect(cached.source.super.url).toContain("deadline=123");
    });

    it("preserves cache behavior for other providers", () => {
        const cached = { source: { super: secureSource("super") } };
        const remove = jest.fn();

        expect(filterProviderMediaSourceCache(
            "another provider",
            cached,
            remove,
        )).toBe(cached);
        expect(remove).not.toHaveBeenCalled();
    });

    it("removes and ignores legacy Audiomack media-source cache", () => {
        const cached = { source: { high: secureSource("high") } };
        const remove = jest.fn();

        expect(filterProviderMediaSourceCache(
            "Audiomack",
            cached,
            remove,
        )).toBeNull();
        expect(remove).toHaveBeenCalledTimes(1);
    });

    it("removes and ignores legacy YouTube media-source cache", () => {
        const cached = { source: { standard: secureSource("standard") } };
        const remove = jest.fn();

        expect(filterProviderMediaSourceCache(
            "Youtube",
            cached,
            remove,
        )).toBeNull();
        expect(remove).toHaveBeenCalledTimes(1);
    });

    it("keeps a valid highest-quality source without retrying", async () => {
        const resolver = jest.fn(async (quality: IMusic.IQualityKey) =>
            secureSource(quality));

        await expect(resolveWithBilibiliQualityFallback(
            "bilibili",
            "super",
            resolver,
        )).resolves.toEqual({ ...secureSource("super"), quality: "super" });
        expect(resolver).toHaveBeenCalledTimes(1);
        expect(resolver).toHaveBeenCalledWith("super");
    });

    it.each([
        ["missing", async () => null],
        ["empty", async () => ({ url: "" })],
        ["thrown", async () => {
            throw new Error("missing array entry");
        }],
    ])("retries %s highest quality once at high", async (_caseName, firstResult) => {
        const resolver = jest
            .fn<Promise<IPlugin.IMediaSourceResult | null>, [IMusic.IQualityKey]>()
            .mockImplementationOnce(firstResult)
            .mockResolvedValueOnce(secureSource("high"));

        await expect(resolveWithBilibiliQualityFallback(
            "bilibili",
            "super",
            resolver,
        )).resolves.toEqual({ ...secureSource("high"), quality: "high" });
        expect(resolver.mock.calls).toEqual([["super"], ["high"]]);
    });

    it("stops after the single high-quality fallback fails", async () => {
        const resolver = jest.fn(async () => null);

        await expect(resolveWithBilibiliQualityFallback(
            "bilibili",
            "super",
            resolver,
        )).resolves.toBeNull();
        expect(resolver).toHaveBeenCalledTimes(2);
    });

    it("stops when the single high-quality fallback throws", async () => {
        const resolver = jest
            .fn<Promise<IPlugin.IMediaSourceResult | null>, [IMusic.IQualityKey]>()
            .mockResolvedValueOnce(null)
            .mockRejectedValueOnce(new Error("high unavailable"));

        await expect(resolveWithBilibiliQualityFallback(
            "bilibili",
            "super",
            resolver,
        )).resolves.toBeNull();
        expect(resolver.mock.calls).toEqual([["super"], ["high"]]);
    });

    it("does not retry other Bilibili qualities", async () => {
        const resolver = jest.fn(async () => null);

        await expect(resolveWithBilibiliQualityFallback(
            "bilibili",
            "high",
            resolver,
        )).resolves.toBeNull();
        expect(resolver).toHaveBeenCalledTimes(1);
    });

    it("preserves non-Bilibili resolver behavior", async () => {
        const failure = new Error("provider failure");
        const resolver = jest.fn(async () => {
            throw failure;
        });

        await expect(resolveWithBilibiliQualityFallback(
            "another provider",
            "super",
            resolver,
        )).rejects.toBe(failure);
        expect(resolver).toHaveBeenCalledTimes(1);
    });

    it.each([
        "http://media.example.com/high.m4s",
        "https://user@media.example.com/high.m4s",
        "https://user:secret@media.example.com/high.m4s",
        " https://media.example.com/high.m4s ",
        "not a URL",
    ])("rejects unsafe Bilibili fallback URL %s", async url => {
        const resolver = jest
            .fn<Promise<IPlugin.IMediaSourceResult | null>, [IMusic.IQualityKey]>()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ url });

        await expect(resolveWithBilibiliQualityFallback(
            "bilibili",
            "super",
            resolver,
        )).resolves.toBeNull();
        expect(resolver).toHaveBeenCalledTimes(2);
    });

    it("returns new result objects without mutating the plugin response", async () => {
        const response = secureSource("high");
        const original = JSON.parse(JSON.stringify(response));

        const resolved = await resolveWithBilibiliQualityFallback(
            "bilibili",
            "super",
            async quality => quality === "super" ? null : response,
        );

        expect(resolved).not.toBe(response);
        expect(resolved?.headers).not.toBe(response.headers);
        expect(response).toEqual(original);
    });
});
