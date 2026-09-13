import NAVIDROME_MANAGED_PLUGIN from "../navidromePluginSource";
import WEBDAV_MANAGED_PLUGIN from "../webdavPluginSource";

type ConsoleMock = {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    info: jest.Mock;
};

type NavidromePlugin = {
    platform: string;
    version: string;
    cacheControl: string;
    supportedSearchType: string[];
    userVariables: IPlugin.IUserVariable[];
    search(
        query: string,
        page: number,
        type: ICommon.SupportMediaType,
    ): Promise<IPlugin.ISearchResult<ICommon.SupportMediaType> | undefined>;
    getAlbumInfo(
        albumItem: IAlbum.IAlbumItemBase,
    ): Promise<IPlugin.IAlbumInfoResult | null>;
    getMediaSource(
        musicItem: IMusic.IMusicItemBase,
    ): Promise<IPlugin.IMediaSourceResult | null>;
};

type WebDAVPlugin = {
    platform: string;
    version: string;
    cacheControl: string;
    supportedSearchType: string[];
    userVariables: IPlugin.IUserVariable[];
    search(
        query: string,
        page: number,
        type: ICommon.SupportMediaType,
    ): Promise<IPlugin.ISearchResult<ICommon.SupportMediaType> | undefined>;
    getTopLists(): Promise<IMusic.IMusicSheetGroupItem[]>;
    getTopListDetail(
        topListItem: IMusic.IMusicSheetItemBase,
    ): Promise<IPlugin.ITopListInfoResult>;
    getMediaSource(
        musicItem: IMusic.IMusicItemBase,
    ): Promise<IPlugin.IMediaSourceResult | null>;
};

function createConsole(): ConsoleMock {
    return {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
    };
}

function createNavidromePlugin({
    get = jest.fn(),
    userVariables = {},
    consoleMock = createConsole(),
}: {
    get?: jest.Mock;
    userVariables?: Record<string, string>;
    consoleMock?: ConsoleMock;
} = {}) {
    const module = { exports: {} as NavidromePlugin };
    const dependencies: Record<string, unknown> = {
        axios: { default: { get } },
        "crypto-js": {
            MD5: jest.fn(() => ({
                toString: jest.fn(() => "token"),
            })),
            enc: { Hex: {} },
        },
    };
    // Mirrors the production plugin sandbox so the bundled source is tested intact.
    // eslint-disable-next-line no-new-func
    const pluginFactory = Function(`
        "use strict";
        return function(require, __musicfree_require, module, exports, console, env, URL, process) {
            ${NAVIDROME_MANAGED_PLUGIN.source}
        };
    `)();
    const requireDependency = (name: string) => dependencies[name];

    pluginFactory(
        requireDependency,
        requireDependency,
        module,
        module.exports,
        consoleMock,
        { getUserVariables: () => ({ ...userVariables }), os: "ios" },
        URL,
        { env: {} },
    );
    return { plugin: module.exports, get, consoleMock };
}

function createWebDAVPlugin({
    createClient = jest.fn(),
    userVariables = {},
    consoleMock = createConsole(),
}: {
    createClient?: jest.Mock;
    userVariables?: Record<string, string>;
    consoleMock?: ConsoleMock;
} = {}) {
    const module = { exports: {} as WebDAVPlugin };
    const dependencies: Record<string, unknown> = {
        webdav: {
            AuthType: { Password: "password" },
            createClient,
        },
    };
    // Mirrors the production plugin sandbox so the bundled source is tested intact.
    // eslint-disable-next-line no-new-func
    const pluginFactory = Function(`
        "use strict";
        return function(require, __musicfree_require, module, exports, console, env, URL, process) {
            ${WEBDAV_MANAGED_PLUGIN.source}
        };
    `)();
    const requireDependency = (name: string) => dependencies[name];

    pluginFactory(
        requireDependency,
        requireDependency,
        module,
        module.exports,
        consoleMock,
        { getUserVariables: () => ({ ...userVariables }), os: "ios" },
        URL,
        { env: {} },
    );
    return { plugin: module.exports, createClient, consoleMock };
}

describe("managed self-hosted plugin sources", () => {
    describe("Navidrome", () => {
        it("exports a managed identity without a remote updater or credential logging", async () => {
            const { plugin, consoleMock } = createNavidromePlugin();

            expect(NAVIDROME_MANAGED_PLUGIN).toMatchObject({
                platform: "Navidrome",
                version: "0.0.1-mymusic.1",
            });
            expect(plugin).toMatchObject({
                platform: "Navidrome",
                version: "0.0.1-mymusic.1",
                cacheControl: "no-store",
                supportedSearchType: ["music", "album"],
            });
            expect(plugin).not.toHaveProperty("srcUrl");
            expect(NAVIDROME_MANAGED_PLUGIN.source).not.toContain("console.");

            await plugin.search("anything", 1, "music");
            await plugin.getMediaSource({ id: "song-1", platform: "Navidrome" });
            expect(consoleMock.log).not.toHaveBeenCalled();
            expect(consoleMock.warn).not.toHaveBeenCalled();
            expect(consoleMock.error).not.toHaveBeenCalled();
        });

        it("returns empty search and null media source while unconfigured", async () => {
            const { plugin, get } = createNavidromePlugin();

            await expect(plugin.search("x", 1, "music")).resolves.toEqual({
                isEnd: true,
                data: [],
            });
            await expect(plugin.search("x", 1, "album")).resolves.toEqual({
                isEnd: true,
                data: [],
            });
            await expect(plugin.getAlbumInfo({
                id: "album-1",
                title: "Album",
                description: "",
                platform: "Navidrome",
            }))
                .resolves.toEqual({ isEnd: true, musicList: [] });
            await expect(plugin.getMediaSource({ id: "song-1", platform: "Navidrome" }))
                .resolves.toBeNull();
            expect(get).not.toHaveBeenCalled();
        });

        it("maps Subsonic album songs to the app musicList contract immutably", async () => {
            const get = jest.fn(async (url: string) => {
                if (url.endsWith("/rest/getAlbum")) {
                    return {
                        data: {
                            "subsonic-response": {
                                album: {
                                    song: [{
                                        id: "song-1",
                                        title: "First",
                                        artist: "Artist",
                                        coverArt: "cover-1",
                                    }],
                                },
                            },
                        },
                    };
                }
                return { data: { "subsonic-response": {} } };
            });
            const { plugin } = createNavidromePlugin({
                get,
                userVariables: {
                    url: "https://music.example",
                    username: "john",
                    password: "secret",
                },
            });

            const result = await plugin.getAlbumInfo({
                id: "album-1",
                title: "Album",
                description: "",
                platform: "Navidrome",
            });
            expect(result).toEqual({
                isEnd: true,
                musicList: [{
                    id: "song-1",
                    title: "First",
                    artist: "Artist",
                    coverArt: "cover-1",
                    artwork: "cover-1",
                }],
            });
            result!.musicList![0].title = "Changed";

            await expect(plugin.getAlbumInfo({
                id: "album-1",
                title: "Album",
                description: "",
                platform: "Navidrome",
            })).resolves.toMatchObject({
                musicList: [{ title: "First" }],
            });
        });

        it("defaults a bare Navidrome host to HTTPS", async () => {
            const get = jest.fn(async () => ({
                data: { "subsonic-response": { searchResult2: {} } },
            }));
            const { plugin } = createNavidromePlugin({
                get,
                userVariables: {
                    url: "music.example",
                    username: "john",
                    password: "secret",
                },
            });

            await plugin.search("song", 1, "music");

            expect(get).toHaveBeenCalledWith(
                "https://music.example/rest/search2",
                expect.anything(),
            );
        });

        it("rejects cleartext Navidrome credentials", async () => {
            const get = jest.fn();
            const { plugin } = createNavidromePlugin({
                get,
                userVariables: {
                    url: "http://music.example",
                    username: "john",
                    password: "secret",
                },
            });

            await expect(plugin.search("song", 1, "music")).resolves.toEqual({
                isEnd: true,
                data: [],
            });
            expect(get).not.toHaveBeenCalled();
        });
    });

    describe("WebDAV", () => {
        it("exports a managed identity without a remote updater", () => {
            const { plugin } = createWebDAVPlugin();

            expect(WEBDAV_MANAGED_PLUGIN).toMatchObject({
                platform: "WebDAV",
                version: "0.0.3-mymusic.1",
            });
            expect(plugin).toMatchObject({
                platform: "WebDAV",
                version: "0.0.3-mymusic.1",
                cacheControl: "no-store",
                supportedSearchType: ["music"],
            });
            expect(plugin).not.toHaveProperty("srcUrl");
            expect(WEBDAV_MANAGED_PLUGIN.source).not.toContain("console.");
        });

        it("is null-safe and quiet while unconfigured", async () => {
            const { plugin, createClient, consoleMock } = createWebDAVPlugin();

            await expect(plugin.search("song", 1, "music")).resolves.toEqual({
                isEnd: true,
                data: [],
            });
            await expect(plugin.getTopLists()).resolves.toEqual([]);
            await expect(plugin.getTopListDetail({
                id: "/",
                title: "All",
                platform: "WebDAV",
            }))
                .resolves.toEqual({ isEnd: true, musicList: [] });
            await expect(plugin.getMediaSource({ id: "/song.mp3", platform: "WebDAV" }))
                .resolves.toBeNull();
            expect(createClient).not.toHaveBeenCalled();
            expect(consoleMock.log).not.toHaveBeenCalled();
            expect(consoleMock.warn).not.toHaveBeenCalled();
            expect(consoleMock.error).not.toHaveBeenCalled();
        });

        it("recognizes audio extensions when MIME is absent and keeps cached rows immutable", async () => {
            const getDirectoryContents = jest.fn(async () => [
                { type: "file", basename: "No Mime.mp3", filename: "/No Mime.mp3" },
                {
                    type: "file",
                    mime: "audio/mpeg",
                    basename: "Song One.mp3",
                    filename: "/Song One.mp3",
                },
                {
                    type: "file",
                    mime: "text/plain",
                    basename: "Notes.txt",
                    filename: "/Notes.txt",
                },
            ]);
            const createClient = jest.fn(() => ({
                getDirectoryContents,
                getFileDownloadLink: jest.fn((path: string) =>
                    `https://files.example${path}`),
            }));
            const { plugin } = createWebDAVPlugin({
                createClient,
                userVariables: {
                    url: "https://files.example",
                    username: "john",
                    password: "secret",
                    searchPath: "/music",
                },
            });

            const first = await plugin.search("", 1, "music");
            expect(first).toEqual({
                isEnd: true,
                data: [
                    {
                        title: "No Mime.mp3",
                        id: "/No Mime.mp3",
                        artist: "Unknown Artist",
                        album: "Unknown Album",
                    },
                    {
                        title: "Song One.mp3",
                        id: "/Song One.mp3",
                        artist: "Unknown Artist",
                        album: "Unknown Album",
                    },
                ],
            });
            first!.data[0].title = "Changed";

            await expect(plugin.search("Song", 1, "music")).resolves.toEqual({
                isEnd: true,
                data: [{
                    title: "Song One.mp3",
                    id: "/Song One.mp3",
                    artist: "Unknown Artist",
                    album: "Unknown Album",
                }],
            });
            expect(getDirectoryContents).toHaveBeenCalledTimes(1);
        });

        it("returns null instead of throwing when a client cannot produce a media URL", async () => {
            const createClient = jest.fn(() => ({
                getDirectoryContents: jest.fn(),
                getFileDownloadLink: jest.fn(() => undefined),
            }));
            const { plugin } = createWebDAVPlugin({
                createClient,
                userVariables: {
                    url: "https://files.example",
                    username: "john",
                    password: "secret",
                },
            });

            await expect(plugin.getMediaSource({ id: "/missing.mp3", platform: "WebDAV" }))
                .resolves.toBeNull();
        });

        it("defaults a bare WebDAV host to HTTPS", async () => {
            const createClient = jest.fn(() => ({
                getDirectoryContents: jest.fn(async () => []),
                getFileDownloadLink: jest.fn(),
            }));
            const { plugin } = createWebDAVPlugin({
                createClient,
                userVariables: {
                    url: "files.example",
                    username: "john",
                    password: "secret",
                },
            });

            await plugin.getTopLists();

            expect(createClient).toHaveBeenCalledWith(
                "https://files.example",
                expect.anything(),
            );
        });

        it("rejects cleartext WebDAV credentials", async () => {
            const createClient = jest.fn();
            const { plugin } = createWebDAVPlugin({
                createClient,
                userVariables: {
                    url: "http://files.example",
                    username: "john",
                    password: "secret",
                },
            });

            await expect(plugin.getTopLists()).resolves.toEqual([]);
            expect(createClient).not.toHaveBeenCalled();
        });
    });
});
