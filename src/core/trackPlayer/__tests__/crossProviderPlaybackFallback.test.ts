import {
    ensureCrossProviderPlaybackFallbackDefault,
    getPlaybackPersistenceTrack,
    resolveCrossProviderPlaybackFallback,
} from "../crossProviderPlaybackFallback";

const originalTrack = {
    id: "original-1",
    platform: "bilibili",
    title: "Hello (Live)",
    artist: "Adele",
    duration: 300,
    album: "25",
    artwork: "https://images.example/cover.jpg",
} as IMusic.IMusicItem;

function candidate(overrides: Partial<IMusic.IMusicItem> = {}) {
    return {
        ...originalTrack,
        id: "candidate-1",
        platform: "Youtube",
        ...overrides,
    } as IMusic.IMusicItem;
}

function plugin(
    name: string,
    search: jest.Mock = jest.fn(),
    getMediaSource: jest.Mock = jest.fn(),
) {
    return {
        name,
        methods: { search, getMediaSource },
    };
}

describe("cross-provider playback fallback", () => {
    it.each([
        [undefined, true, 1],
        [false, false, 0],
        [true, true, 0],
    ])("defaults only a missing preference (%s)", (stored, expected, writes) => {
        let value = stored;
        const config = {
            getConfig: jest.fn(() => value),
            setConfig: jest.fn((_key, nextValue) => {
                value = nextValue;
            }),
        };

        ensureCrossProviderPlaybackFallbackDefault(config);

        expect(value).toBe(expected);
        expect(config.setConfig).toHaveBeenCalledTimes(writes);
    });

    it("persists original identity instead of fallback URL and headers", () => {
        const resolvedTrack = {
            ...originalTrack,
            url: "https://signed.example/audio.m4a?token=secret",
            headers: { Authorization: "Bearer secret" },
        };

        expect(getPlaybackPersistenceTrack(
            resolvedTrack,
            originalTrack,
            true,
        )).toBe(originalTrack);
        expect(getPlaybackPersistenceTrack(
            resolvedTrack,
            originalTrack,
            false,
        )).toBe(resolvedTrack);
    });

    it("searches only Youtube then Audiomack with title and artist", async () => {
        const youtubeSearch = jest.fn().mockResolvedValue({ data: [] });
        const audiomackSearch = jest.fn().mockResolvedValue({ data: [] });
        const plugins = [
            plugin("Spotify"),
            plugin("Audiomack", audiomackSearch),
            plugin("Youtube", youtubeSearch),
        ];

        await resolveCrossProviderPlaybackFallback({
            musicItem: { ...originalTrack, alias: "Greeting" },
            qualityOrder: ["high", "standard"],
            getPluginByName: name => plugins.find(item => item.name === name),
        });

        expect(youtubeSearch).toHaveBeenCalledWith("Greeting Adele", 1, "music");
        expect(audiomackSearch).toHaveBeenCalledWith("Greeting Adele", 1, "music");
        expect(youtubeSearch.mock.invocationCallOrder[0])
            .toBeLessThan(audiomackSearch.mock.invocationCallOrder[0]);
    });

    it("skips a provider whose source already failed in the native player", async () => {
        const youtubeSearch = jest.fn().mockResolvedValue({ data: [] });
        const audiomackSearch = jest.fn().mockResolvedValue({ data: [] });
        const plugins = [
            plugin("Youtube", youtubeSearch),
            plugin("Audiomack", audiomackSearch),
        ];

        await resolveCrossProviderPlaybackFallback({
            musicItem: originalTrack,
            qualityOrder: ["standard"],
            excludedProviderNames: ["Youtube"],
            getPluginByName: name => plugins.find(item => item.name === name),
        });

        expect(youtubeSearch).not.toHaveBeenCalled();
        expect(audiomackSearch).toHaveBeenCalledTimes(1);
    });

    it("inspects at most five results and picks the deterministic best match", async () => {
        const best = candidate({ id: "best", title: "Hello Live", artist: "Adele" });
        const sixth = candidate({ id: "sixth", title: "Hello (Live)", artist: "Adele" });
        const getMediaSource = jest.fn(async item =>
            item.id === "best" ? { url: "https://cdn.example/best.m4a" } : null,
        );
        const youtube = plugin(
            "Youtube",
            jest.fn().mockResolvedValue({
                data: [
                    candidate({ id: "weak", title: "Hello", artist: "Adele" }),
                    candidate({ id: "noise-1", title: "Goodbye", artist: "Other" }),
                    best,
                    candidate({ id: "noise-2", title: "Halo", artist: "Beyonce" }),
                    candidate({ id: "noise-3", title: "Hello", artist: "Lionel Richie" }),
                    sixth,
                ],
            }),
            getMediaSource,
        );

        const result = await resolveCrossProviderPlaybackFallback({
            musicItem: originalTrack,
            qualityOrder: ["standard"],
            getPluginByName: name => name === "Youtube" ? youtube : undefined,
        });

        expect(result?.source.url).toBe("https://cdn.example/best.m4a");
        expect(result?.matchedItem.id).toBe("best");
        expect(getMediaSource).not.toHaveBeenCalledWith(
            expect.objectContaining({ id: "sixth" }),
            expect.anything(),
        );
    });

    it("rejects candidates whose version tokens do not match", async () => {
        const youtubeSource = jest.fn().mockResolvedValue({
            url: "https://cdn.example/audio.m4a",
        });
        const youtube = plugin(
            "Youtube",
            jest.fn().mockResolvedValue({
                data: [
                    candidate({ title: "Hello (Studio Version)" }),
                    candidate({ id: "cover", title: "Hello (Live Cover)" }),
                ],
            }),
            youtubeSource,
        );

        const result = await resolveCrossProviderPlaybackFallback({
            musicItem: originalTrack,
            qualityOrder: ["standard"],
            getPluginByName: name => name === "Youtube" ? youtube : undefined,
        });

        expect(result).toBeNull();
        expect(youtubeSource).not.toHaveBeenCalled();
    });

    it("rejects Chinese version-token mismatches", async () => {
        const source = jest.fn().mockResolvedValue({
            url: "https://cdn.example/audio.m4a",
        });
        const youtube = plugin(
            "Youtube",
            jest.fn().mockResolvedValue({ data: [
                candidate({ title: "后来 翻唱", artist: "刘若英" }),
            ] }),
            source,
        );

        await expect(resolveCrossProviderPlaybackFallback({
            musicItem: candidate({
                platform: "bilibili",
                title: "后来 现场",
                artist: "刘若英",
            }),
            qualityOrder: ["standard"],
            getPluginByName: name => name === "Youtube" ? youtube : undefined,
        })).resolves.toBeNull();
        expect(source).not.toHaveBeenCalled();
    });

    it("matches common official YouTube artist-channel suffixes", async () => {
        const youtube = plugin(
            "Youtube",
            jest.fn().mockResolvedValue({ data: [
                candidate({ title: "Hello Live", artist: "AdeleVEVO" }),
            ] }),
            jest.fn().mockResolvedValue({ url: "https://cdn.example/audio.m4a" }),
        );

        await expect(resolveCrossProviderPlaybackFallback({
            musicItem: originalTrack,
            qualityOrder: ["standard"],
            getPluginByName: name => name === "Youtube" ? youtube : undefined,
        })).resolves.toEqual(expect.objectContaining({
            matchedItem: expect.objectContaining({ artist: "AdeleVEVO" }),
        }));
    });

    it("uses a clean alias to recover noisy provider titles", async () => {
        const youtube = plugin(
            "Youtube",
            jest.fn().mockResolvedValue({ data: [
                candidate({
                    id: "clean-match",
                    title: "Blue and White Porcelain",
                    artist: "Jay Chou",
                }),
            ] }),
            jest.fn().mockResolvedValue({ url: "https://cdn.example/audio.m4a" }),
        );

        await expect(resolveCrossProviderPlaybackFallback({
            musicItem: {
                ...originalTrack,
                title: "[Fan edit] Jay Chou highlights - Blue and White Porcelain!!!",
                alias: "Blue and White Porcelain",
                artist: "Jay Chou",
            },
            qualityOrder: ["standard"],
            getPluginByName: name => name === "Youtube" ? youtube : undefined,
        })).resolves.toEqual(expect.objectContaining({
            matchedItem: expect.objectContaining({ id: "clean-match" }),
        }));
        expect(youtube.methods.search).toHaveBeenCalledWith(
            "Blue and White Porcelain Jay Chou",
            1,
            "music",
        );
    });

    it("preserves version requirements from the original title when using an alias", async () => {
        const source = jest.fn().mockResolvedValue({
            url: "https://cdn.example/audio.m4a",
        });
        const youtube = plugin(
            "Youtube",
            jest.fn().mockResolvedValue({ data: [
                candidate({
                    id: "studio-match",
                    title: "Blue and White Porcelain",
                    artist: "Jay Chou",
                }),
            ] }),
            source,
        );

        await expect(resolveCrossProviderPlaybackFallback({
            musicItem: {
                ...originalTrack,
                title: "Blue and White Porcelain (Live)",
                alias: "Blue and White Porcelain",
                artist: "Jay Chou",
            },
            qualityOrder: ["standard"],
            getPluginByName: name => name === "Youtube" ? youtube : undefined,
        })).resolves.toBeNull();
        expect(source).not.toHaveBeenCalled();
    });

    it("continues through candidates, qualities, errors, and the next provider", async () => {
        const youtubeSource = jest.fn()
            .mockRejectedValueOnce(new Error("high failed"))
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ url: "http://unsafe.example/audio.mp3" })
            .mockResolvedValueOnce(null);
        const audiomackSource = jest.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                url: "https://music.audiomack.com/audio.m4a",
                headers: { Referer: "https://audiomack.com" },
                quality: "standard",
            });
        const youtube = plugin(
            "Youtube",
            jest.fn().mockResolvedValue({ data: [
                candidate({ id: "yt-1", title: "Hello Live" }),
                candidate({ id: "yt-2", title: "Hello - Live" }),
            ] }),
            youtubeSource,
        );
        const audiomack = plugin(
            "Audiomack",
            jest.fn().mockResolvedValue({ data: [
                candidate({ id: "am-1", platform: "Audiomack", title: "Hello Live" }),
            ] }),
            audiomackSource,
        );

        const result = await resolveCrossProviderPlaybackFallback({
            musicItem: originalTrack,
            qualityOrder: ["high", "standard"],
            getPluginByName: name => name === "Youtube" ? youtube : audiomack,
        });

        expect(result).toEqual({
            matchedItem: expect.objectContaining({ id: "am-1" }),
            source: {
                url: "https://music.audiomack.com/audio.m4a",
                headers: { Referer: "https://audiomack.com" },
                quality: "standard",
            },
        });
    });

    it("records the successful requested quality when the provider omits it", async () => {
        const youtube = plugin(
            "Youtube",
            jest.fn().mockResolvedValue({ data: [candidate({ title: "Hello Live" })] }),
            jest.fn().mockResolvedValue({ url: "https://cdn.example/audio.m4a" }),
        );

        const result = await resolveCrossProviderPlaybackFallback({
            musicItem: originalTrack,
            qualityOrder: ["high", "standard"],
            getPluginByName: name => name === "Youtube" ? youtube : undefined,
        });

        expect(result?.source.quality).toBe("high");
    });

    it.each([
        "http://cdn.example/audio.mp3",
        "https://user:pass@cdn.example/audio.mp3",
        "https://localhost/audio.mp3",
        "https://127.0.0.1/audio.mp3",
        "https://169.254.1.2/audio.mp3",
        "https://10.0.0.1/audio.mp3",
        "https://[::1]/audio.mp3",
        "https://[::ffff:127.0.0.1]/audio.mp3",
        "https://cdn.example/audio.mp3\n",
    ])("rejects unsafe object media URL %s", async url => {
        const youtube = plugin(
            "Youtube",
            jest.fn().mockResolvedValue({ data: [candidate({ title: "Hello Live" })] }),
            jest.fn().mockResolvedValue({ url }),
        );

        await expect(resolveCrossProviderPlaybackFallback({
            musicItem: originalTrack,
            qualityOrder: ["standard"],
            getPluginByName: name => name === "Youtube" ? youtube : undefined,
        })).resolves.toBeNull();
    });

    it("does not recurse into the original provider", async () => {
        const original = plugin("Youtube", jest.fn(), jest.fn());
        const audiomack = plugin(
            "Audiomack",
            jest.fn().mockResolvedValue({ data: [] }),
        );

        await resolveCrossProviderPlaybackFallback({
            musicItem: { ...originalTrack, platform: "Youtube" },
            qualityOrder: ["standard"],
            getPluginByName: name => name === "Youtube" ? original : audiomack,
        });

        expect(original.methods.search).not.toHaveBeenCalled();
        expect(audiomack.methods.search).toHaveBeenCalledTimes(1);
    });

    it("honors abort checks before searching or resolving", async () => {
        const youtube = plugin("Youtube", jest.fn(), jest.fn());

        const result = await resolveCrossProviderPlaybackFallback({
            musicItem: originalTrack,
            qualityOrder: ["standard"],
            getPluginByName: () => youtube,
            shouldAbort: () => true,
        });

        expect(result).toBeNull();
        expect(youtube.methods.search).not.toHaveBeenCalled();
    });

    it("stops at the deadline even when a provider hangs", async () => {
        jest.useFakeTimers();
        const youtube = plugin(
            "Youtube",
            jest.fn(() => new Promise(() => undefined)),
        );

        const resultPromise = resolveCrossProviderPlaybackFallback({
            musicItem: originalTrack,
            qualityOrder: ["standard"],
            getPluginByName: name => name === "Youtube" ? youtube : undefined,
            deadlineMs: 8000,
        });
        await jest.advanceTimersByTimeAsync(8000);

        await expect(resultPromise).resolves.toBeNull();
        jest.useRealTimers();
    });
});
