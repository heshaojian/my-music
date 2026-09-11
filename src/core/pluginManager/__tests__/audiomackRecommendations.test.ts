import AUDIOMACK_MANAGED_PLUGIN from "../managed/audiomackPluginSource";

type AxiosGet = jest.Mock<Promise<unknown>, [string, unknown?]>;

const EXPECTED_TAGS = [
    { id: "whats-new", title: "What's New", url_slug: "whats-new" },
    { id: "afrobeats", title: "Afrobeats", url_slug: "afrobeats" },
    { id: "caribbean", title: "Caribbean", url_slug: "caribbean" },
    { id: "latin", title: "Latin", url_slug: "latin" },
    { id: "pop", title: "Pop", url_slug: "pop" },
    { id: "rb", title: "R&B", url_slug: "rb" },
    { id: "gospel", title: "Gospel", url_slug: "gospel" },
    { id: "electronic", title: "Electronic", url_slug: "electronic" },
    { id: "rock", title: "Rock", url_slug: "rock" },
] as const;

const createPlugin = (get: AxiosGet = jest.fn()) => {
    const module = { exports: {} } as { exports: IPlugin.IPluginInstance };
    const dependencies: Record<string, unknown> = {
        axios: { default: { get } },
        cheerio: { load: jest.fn() },
        "crypto-js": {
            HmacSHA1: jest.fn(() => ({
                toString: jest.fn(() => "signature"),
            })),
            enc: { Base64: {} },
        },
        dayjs: Object.assign(jest.fn(), {
            unix: jest.fn(() => ({ format: jest.fn(() => "2026-09-11") })),
        }),
    };
    // Mirrors the production plugin sandbox so the bundled source is tested intact.
    // eslint-disable-next-line no-new-func
    const pluginFactory = Function(`
        "use strict";
        return function(require, module, exports) {
            ${AUDIOMACK_MANAGED_PLUGIN.source}
        };
    `)();

    pluginFactory(
        (name: string) => dependencies[name],
        module,
        module.exports,
    );
    return { plugin: module.exports, get };
};

const validPlaylist = {
    id: "playlist-1",
    title: "Fresh Finds",
    url_slug: "fresh-finds",
    track_count: 12,
    image: "https://example.com/cover.jpg",
    created: 1,
    artist: {
        id: "artist-1",
        name: "Audiomack",
        url_slug: "audiomack",
    },
};

describe("managed Audiomack recommendations", () => {
    it("exports the managed identity, full plugin surface, and no remote updater", () => {
        const { plugin } = createPlugin();

        expect(AUDIOMACK_MANAGED_PLUGIN).toMatchObject({
            platform: "Audiomack",
            version: "0.0.3-mymusic.1",
        });
        expect(plugin.platform).toBe("Audiomack");
        expect(plugin.version).toBe("0.0.3-mymusic.1");
        expect(plugin).not.toHaveProperty("srcUrl");
        expect(Object.keys(plugin)).toEqual(expect.arrayContaining([
            "search",
            "getMediaSource",
            "getAlbumInfo",
            "getMusicSheetInfo",
            "getArtistWorks",
            "getRecommendSheetTags",
            "getRecommendSheetsByTag",
            "getTopLists",
            "getTopListDetail",
        ]));
        expect(AUDIOMACK_MANAGED_PLUGIN.source).not.toContain(
            "script#__NEXT_DATA__",
        );
        expect(AUDIOMACK_MANAGED_PLUGIN.source).not.toContain("cheerio");
    });

    it("returns nine copied static tags without requesting or parsing HTML", async () => {
        const { plugin, get } = createPlugin();

        const first = await plugin.getRecommendSheetTags!();
        expect(first).toEqual({ data: [{ data: EXPECTED_TAGS }] });
        expect(get).not.toHaveBeenCalled();
        expect(AUDIOMACK_MANAGED_PLUGIN.source).not.toContain(
            "get(\"https://audiomack.com/playlists\")",
        );
        expect(AUDIOMACK_MANAGED_PLUGIN.source).not.toContain(
            "get(\"https://audiomack.com/\")",
        );

        const firstTags = first.data![0].data!;
        firstTags[0].title = "Changed by caller";
        const second = await plugin.getRecommendSheetTags!();
        expect(second.data![0].data).toEqual(EXPECTED_TAGS);
        expect(second.data![0].data).not.toBe(firstTags);
        expect(second.data![0].data![0]).not.toBe(firstTags[0]);
    });

    it("routes an allowlisted tag slug to the signed categories API", async () => {
        const get: AxiosGet = jest.fn(async (_url: string, _config?: unknown) => ({
            data: { results: { playlists: [validPlaylist] } },
        }));
        const { plugin } = createPlugin(get);

        await expect(plugin.getRecommendSheetsByTag!(
            { id: "rb", title: "R&B", url_slug: "rb" },
            2,
        )).resolves.toMatchObject({
            isEnd: true,
            data: [{ id: "playlist-1", title: "Fresh Finds" }],
        });

        expect(get).toHaveBeenCalledWith(
            "https://api.audiomack.com/v1/playlist/categories",
            expect.objectContaining({
                params: expect.objectContaining({
                    page: 2,
                    slug: "rb",
                    oauth_signature: "signature",
                }),
            }),
        );
    });

    it.each([
        undefined,
        {},
        { id: "34", title: "What's New", url_slug: "whats-new" },
        { id: "stale", title: "Stale", url_slug: "retired-category" },
        { id: "rb", title: "R&B", url_slug: "../rb" },
    ])("normalizes a missing, stale, or unsafe tag to What's New", async tag => {
        const get: AxiosGet = jest.fn(async (_url: string, _config?: unknown) => ({
            data: { results: { playlists: [] } },
        }));
        const { plugin } = createPlugin(get);

        await plugin.getRecommendSheetsByTag!(tag as ICommon.IUnique, 1);

        expect(get).toHaveBeenCalledWith(
            "https://api.audiomack.com/v1/playlist/categories",
            expect.objectContaining({
                params: expect.objectContaining({ slug: "whats-new" }),
            }),
        );
    });

    it.each([
        undefined,
        null,
        {},
        { results: null },
        { results: {} },
        { results: { playlists: null } },
    ])("returns an empty page for malformed successful response %#", async data => {
        const get: AxiosGet = jest.fn(
            async (_url: string, _config?: unknown) => ({ data }),
        );
        const { plugin } = createPlugin(get);

        await expect(plugin.getRecommendSheetsByTag!(
            { id: "whats-new", title: "What's New", url_slug: "whats-new" },
            1,
        )).resolves.toEqual({ isEnd: true, data: [] });
    });

    it("filters malformed playlist rows before formatting", async () => {
        const get: AxiosGet = jest.fn(async (_url: string, _config?: unknown) => ({
            data: {
                results: {
                    playlists: [
                        null,
                        "not-a-playlist",
                        {},
                        { ...validPlaylist, id: null },
                        { ...validPlaylist, title: "" },
                        { ...validPlaylist, url_slug: null },
                        validPlaylist,
                    ],
                },
            },
        }));
        const { plugin } = createPlugin(get);

        await expect(plugin.getRecommendSheetsByTag!(
            { id: "whats-new", title: "What's New", url_slug: "whats-new" },
            1,
        )).resolves.toMatchObject({
            isEnd: true,
            data: [{ id: "playlist-1", title: "Fresh Finds" }],
        });
    });

    it("preserves provider transport failures", async () => {
        const failure = new Error("provider unavailable");
        const get: AxiosGet = jest.fn(async (_url: string, _config?: unknown) => {
            throw failure;
        });
        const { plugin } = createPlugin(get);

        await expect(plugin.getRecommendSheetsByTag!(
            { id: "whats-new", title: "What's New", url_slug: "whats-new" },
            1,
        )).rejects.toBe(failure);
    });

    it("opens a recommended playlist through the signed playlist API", async () => {
        const get: AxiosGet = jest.fn(async (_url: string, _config?: unknown) => ({
            data: {
                results: {
                    tracks: [{
                        id: "track-1",
                        title: "Like, Whatever",
                        artist: "Jhené Aiko, Tyga",
                        duration: "212",
                        image: "https://example.com/track.jpg",
                        url_slug: "like-whatever",
                    }],
                },
            },
        }));
        const { plugin } = createPlugin(get);

        await expect(plugin.getMusicSheetInfo!(
            validPlaylist as unknown as IMusic.IMusicSheetItem,
            1,
        ))
            .resolves.toMatchObject({
                isEnd: true,
                musicList: [{ id: "track-1", title: "Like, Whatever" }],
            });

        expect(get).toHaveBeenCalledWith(
            "https://api.audiomack.com/v1/playlist/playlist-1",
            expect.objectContaining({
                params: expect.objectContaining({
                    page: 1,
                    oauth_signature: "signature",
                }),
            }),
        );
    });

    it("opens a stale playlist item by artist and playlist slug when id is missing", async () => {
        const get: AxiosGet = jest.fn(async (_url: string, _config?: unknown) => ({
            data: { results: { tracks: [] } },
        }));
        const { plugin } = createPlugin(get);

        await plugin.getMusicSheetInfo!({
            ...validPlaylist,
            id: undefined,
        } as unknown as IMusic.IMusicSheetItem, 3);

        expect(get).toHaveBeenCalledWith(
            "https://api.audiomack.com/v1/playlist/audiomack/fresh-finds",
            expect.objectContaining({
                params: expect.objectContaining({ page: 3 }),
            }),
        );
    });

    it.each([
        undefined,
        null,
        {},
        { results: null },
        { results: {} },
        { results: { tracks: null } },
    ])("returns an empty playlist detail for malformed response %#", async data => {
        const get: AxiosGet = jest.fn(
            async (_url: string, _config?: unknown) => ({ data }),
        );
        const { plugin } = createPlugin(get);

        await expect(plugin.getMusicSheetInfo!(
            validPlaylist as unknown as IMusic.IMusicSheetItem,
            1,
        ))
            .resolves.toEqual({ isEnd: true, musicList: [] });
    });

    it("accepts the verified Audiomack media CDN host", async () => {
        const mediaUrl =
            "https://music.audiomack.com/media/example.mp3?token=redacted";
        const get: AxiosGet = jest.fn(
            async (_url: string, _config?: unknown) => ({
                data: { signedUrl: mediaUrl },
            }),
        );
        const { plugin } = createPlugin(get);

        await expect(plugin.getMediaSource!(
            { id: "track-1" } as IMusic.IMusicItem,
            "standard",
        )).resolves.toEqual({ url: mediaUrl });
    });

    it.each([
        "http://music.audiomack.com/media/example.mp3",
        "https://user@music.audiomack.com/media/example.mp3",
        "https://user:secret@music.audiomack.com/media/example.mp3",
        " https://music.audiomack.com/media/example.mp3 ",
        "https://music.audiomack.com.evil.example/media/example.mp3",
        "https://example.com/media/example.mp3",
        "not a URL",
        "",
    ])("rejects unsafe or unexpected media URL %s", async signedUrl => {
        const get: AxiosGet = jest.fn(
            async (_url: string, _config?: unknown) => ({
                data: { signedUrl },
            }),
        );
        const { plugin } = createPlugin(get);

        await expect(plugin.getMediaSource!(
            { id: "track-1" } as IMusic.IMusicItem,
            "standard",
        )).resolves.toBeNull();
    });

    it("preserves media provider transport failures", async () => {
        const failure = new Error("media provider unavailable");
        const get: AxiosGet = jest.fn(
            async (_url: string, _config?: unknown) => {
                throw failure;
            },
        );
        const { plugin } = createPlugin(get);

        await expect(plugin.getMediaSource!(
            { id: "track-1" } as IMusic.IMusicItem,
            "standard",
        )).rejects.toBe(failure);
    });
});
