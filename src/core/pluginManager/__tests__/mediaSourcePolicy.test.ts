import {
    getPreferredDirectMediaSource,
    normalizePluginMediaSource,
    resolveProviderMediaSource,
} from "../mediaSourcePolicy";

const createMusicItem = (overrides: Partial<IMusic.IMusicItem> = {}) => ({
    id: "1047916",
    title: "Rain Keeps Falling",
    artist: "MaoerFM artist",
    platform: "猫耳FM",
    url: "https://media.example.com/audio/song.m4a?token=signed#stream",
    ...overrides,
}) as IMusic.IMusicItem;

describe("MaoerFM media source policy", () => {
    it.each(["m4a", "M4A", "mp3", "aac"])(
        "prefers an HTTPS .%s provider source without mutating the item",
        extension => {
            const musicItem = createMusicItem({
                url: `https://media.example.com/audio/song.${extension}?token=signed#stream`,
            });
            const original = { ...musicItem };

            const source = getPreferredDirectMediaSource(musicItem);

            expect(source).toEqual({ url: musicItem.url });
            expect(source).not.toBe(musicItem);
            expect(musicItem).toEqual(original);
        },
    );

    it.each([
        ["another provider", { platform: "bilibili" }],
        ["HTTP", { url: "http://media.example.com/song.m4a" }],
        ["username", { url: "https://user@media.example.com/song.m4a" }],
        ["password", { url: "https://user:secret@media.example.com/song.m4a" }],
        ["protected HLS", { url: "https://media.example.com/song.m3u8" }],
        ["deceptive suffix", { url: "https://media.example.com/song.m4a.exe" }],
        ["malformed URL", { url: "not a URL.m4a" }],
        ["missing URL", { url: undefined }],
    ])("does not prefer %s sources", (_caseName, overrides) => {
        expect(
            getPreferredDirectMediaSource(createMusicItem(overrides)),
        ).toBeNull();
    });

    it("does not invoke the plugin resolver for a safe direct source", async () => {
        const musicItem = createMusicItem();
        const resolver = jest.fn(async () => ({
            url: "https://media.example.com/protected.m3u8",
        }));

        await expect(
            resolveProviderMediaSource(musicItem, resolver),
        ).resolves.toEqual({ url: musicItem.url });
        expect(resolver).not.toHaveBeenCalled();
    });

    it("preserves existing resolver behavior when no safe direct source exists", async () => {
        const musicItem = createMusicItem({ platform: "bilibili" });
        const resolved = {
            url: "https://media.example.com/resolved.m4a",
            headers: { Referer: "https://example.com" },
        };
        const resolver = jest.fn(async () => resolved);

        await expect(
            resolveProviderMediaSource(musicItem, resolver),
        ).resolves.toBe(resolved);
        expect(resolver).toHaveBeenCalledTimes(1);
    });
});

describe("legacy plugin media source compatibility", () => {
    it("wraps a non-empty URL string without mutating it", () => {
        const url = "https://cdn.example.com/audio/song.mp3";

        expect(normalizePluginMediaSource(url)).toEqual({ url });
    });

    it("preserves an object media source", () => {
        const source = {
            url: "https://cdn.example.com/audio/song.m4a",
            headers: { Referer: "https://example.com" },
        };

        expect(normalizePluginMediaSource(source)).toBe(source);
    });

    it.each([
        undefined,
        null,
        "",
        "   ",
        " https://cdn.example.com/audio/song.mp3 ",
        "http://cdn.example.com/audio/song.mp3",
        "https://user:secret@cdn.example.com/audio/song.mp3",
        "file:///private/audio/song.mp3",
        "https://localhost/audio/song.mp3",
        "https://127.0.0.1/audio/song.mp3",
        "https://192.168.1.20/audio/song.mp3",
        "https://[::1]/audio/song.mp3",
        "not a URL",
        "https://cdn.example.com/audio/song.mp3\nnext",
        42,
        true,
        [],
    ])(
        "rejects invalid legacy source %#",
        source => {
            expect(normalizePluginMediaSource(source)).toBeNull();
        },
    );
});
