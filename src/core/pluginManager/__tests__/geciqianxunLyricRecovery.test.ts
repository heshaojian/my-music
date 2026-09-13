import GECIQIANXUN_MANAGED_PLUGIN from "../managed/geciqianxunPluginSource";

type AxiosGet = jest.Mock<Promise<unknown>, [string, unknown?]>;

const createGet = (
    implementation: (url: string, config?: unknown) => Promise<unknown>,
): AxiosGet => jest.fn<Promise<unknown>, [string, unknown?]>(implementation);

const createPlugin = (get: AxiosGet = jest.fn()) => {
    const module = { exports: {} } as { exports: IPlugin.IPluginInstance };
    const dependencies: Record<string, unknown> = {
        axios: { default: { get } },
    };

    // Mirrors the production plugin sandbox so the bundled source is tested intact.
    // eslint-disable-next-line no-new-func
    const pluginFactory = Function(`
        "use strict";
        return function(require, module, exports) {
            ${GECIQIANXUN_MANAGED_PLUGIN.source}
        };
    `)();

    pluginFactory(
        (name: string) => dependencies[name],
        module,
        module.exports,
    );
    return { plugin: module.exports, get };
};

const syncedResult = {
    id: 36847354,
    name: "晴天",
    artistName: "周杰伦",
    albumName: "叶惠美",
    duration: 269,
    syncedLyrics: "[00:00.00]晴天\n[00:10.00]故事的小黄花",
    plainLyrics: "晴天\n故事的小黄花",
};

const plainOnlyResult = {
    id: 23920346,
    name: "Yesterday",
    artistName: "The Beatles",
    albumName: "Help!",
    duration: 125,
    syncedLyrics: "",
    plainLyrics: "Yesterday\nAll my troubles seemed so far away",
};

describe("managed 歌词千寻 lyric recovery", () => {
    it("exports a lyric-only managed plugin identity without a remote updater", () => {
        const { plugin } = createPlugin();

        expect(GECIQIANXUN_MANAGED_PLUGIN).toMatchObject({
            platform: "歌词千寻",
            version: "0.0.1-mymusic.1",
        });
        expect(plugin.platform).toBe("歌词千寻");
        expect(plugin.version).toBe("0.0.1-mymusic.1");
        expect(plugin.supportedSearchType).toEqual(["lyric"]);
        expect(plugin.cacheControl).toBe("no-store");
        expect(plugin).not.toHaveProperty("srcUrl");
        expect(Object.keys(plugin)).toEqual(expect.arrayContaining([
            "search",
            "getLyric",
        ]));
    });

    it("searches LRCLIB and formats Chinese lyric results", async () => {
        const get = createGet(async () => ({
            data: [syncedResult],
        }));
        const { plugin } = createPlugin(get);

        await expect(plugin.search!("晴天 周杰伦", 1, "lyric")).resolves.toEqual({
            isEnd: true,
            data: [{
                id: "36847354",
                title: "晴天",
                artist: "周杰伦",
                album: "叶惠美",
                duration: 269,
                rawLrc: syncedResult.syncedLyrics,
            }],
        });
        expect(get).toHaveBeenCalledWith(
            "https://lrclib.net/api/search",
            expect.objectContaining({
                params: { q: "晴天 周杰伦" },
                headers: expect.objectContaining({
                    "User-Agent": expect.stringContaining("MyMusic/"),
                }),
            }),
        );
    });

    it("searches LRCLIB and formats English plain-lyric results", async () => {
        const get = createGet(async () => ({
            data: [plainOnlyResult],
        }));
        const { plugin } = createPlugin(get);

        await expect(plugin.search!("Yesterday", 1, "lyric")).resolves.toEqual({
            isEnd: true,
            data: [{
                id: "23920346",
                title: "Yesterday",
                artist: "The Beatles",
                album: "Help!",
                duration: 125,
                rawLrc: plainOnlyResult.plainLyrics,
            }],
        });
    });

    it("returns no results for non-lyric search types", async () => {
        const { plugin, get } = createPlugin();

        await expect(plugin.search!("晴天", 1, "music")).resolves.toEqual({
            isEnd: true,
            data: [],
        });
        expect(get).not.toHaveBeenCalled();
    });

    it("fetches lyrics by LRCLIB id and prefers synced lyrics", async () => {
        const get = createGet(async () => ({
            data: syncedResult,
        }));
        const { plugin } = createPlugin(get);

        await expect(plugin.getLyric!({
            id: "36847354",
            platform: "歌词千寻",
        })).resolves.toEqual({
            rawLrc: syncedResult.syncedLyrics,
        });
        expect(get).toHaveBeenCalledWith(
            "https://lrclib.net/api/get/36847354",
            expect.objectContaining({
                headers: expect.objectContaining({
                    "User-Agent": expect.stringContaining("MyMusic/"),
                }),
            }),
        );
    });

    it("filters malformed search rows", async () => {
        const get = createGet(async () => ({
            data: [
                null,
                "not-an-object",
                {},
                { ...syncedResult, id: "" },
                { ...syncedResult, name: "" },
                { ...syncedResult, syncedLyrics: "", plainLyrics: "" },
                syncedResult,
            ],
        }));
        const { plugin } = createPlugin(get);

        const result = await plugin.search!("晴天", 1, "lyric");

        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toMatchObject({
            id: "36847354",
            title: "晴天",
        });
    });

    it("preserves provider transport failures", async () => {
        const failure = new Error("provider unavailable");
        const get = createGet(async () => {
            throw failure;
        });
        const { plugin } = createPlugin(get);

        await expect(plugin.search!("晴天", 1, "lyric")).rejects.toBe(failure);
    });
});
