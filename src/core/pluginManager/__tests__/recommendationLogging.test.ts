import { devLog } from "@/utils/log";
import { Plugin } from "../plugin";

jest.mock("@/utils/log", () => ({
    devLog: jest.fn(),
    errorLog: jest.fn(),
    trace: jest.fn(),
}));
jest.mock("@/constants/commonConst", () => ({
    CacheControl: {
        Cache: "cache",
        NoCache: "no-cache",
        NoStore: "no-store",
    },
    internalSerializeKey: "$",
    localPluginPlatform: "本地音乐",
}));
jest.mock("@/constants/pathConst", () => ({
    __esModule: true,
    default: {
        localLrcPath: "/tmp/lrc/",
        lrcCachePath: "/tmp/lrc-cache/",
    },
}));
jest.mock("react-native-fs", () => ({
    __esModule: true,
    default: {},
    exists: jest.fn(),
    readFile: jest.fn(),
    stat: jest.fn(),
    writeFile: jest.fn(),
}));
jest.mock("@/native/mp3Util", () => ({
    __esModule: true,
    default: {},
}));
jest.mock("@/utils/delay", () => ({
    __esModule: true,
    default: jest.fn(async () => {}),
}));
jest.mock("@/utils/fileUtils", () => ({
    addFileScheme: (path: string) => path,
    getFileName: (path: string) => path,
}));
jest.mock("@/utils/mediaExtra", () => ({
    getMediaExtraProperty: jest.fn(),
    patchMediaExtra: jest.fn(),
}));
jest.mock("@/utils/mediaUtils", () => ({
    getLocalPath: jest.fn(),
    isSameMediaItem: jest.fn(),
    resetMediaItem: (item: unknown) => item,
}));
jest.mock("@/utils/network", () => ({
    __esModule: true,
    default: { isOffline: false },
}));
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
jest.mock("react-native-url-polyfill", () => ({ URL }));
jest.mock("webdav", () => ({}));
jest.mock("../meta", () => ({
    __esModule: true,
    default: { getUserVariables: () => ({}) },
}));
jest.mock("../runtimeEnvironment", () => ({
    createPluginRuntimeEnvironment: () => ({ env: {}, process: {} }),
}));
jest.mock("@/core/i18n", () => ({
    __esModule: true,
    default: { getLanguage: () => ({ locale: "en-US" }) },
}));
jest.mock("@/core/mediaCache", () => ({
    __esModule: true,
    default: {
        getMediaCache: jest.fn(() => null),
        removeMediaCache: jest.fn(),
        setMediaCache: jest.fn(),
    },
}));
jest.mock("react-native-device-info", () => ({
    __esModule: true,
    default: { getVersion: () => "0.6.2" },
}));

const secretFailure = Object.assign(new Error("request failed oauth_signature=secret"), {
    config: {
        url: "https://api.audiomack.com/v1/playlist/categories?oauth_signature=secret",
        headers: { Authorization: "OAuth secret" },
    },
    response: { data: { private: "provider response" } },
});

function createAudiomackPlugin(methods: Partial<IPlugin.IPluginDefine>) {
    return new Plugin(
        () => ({
            platform: "Audiomack",
            ...methods,
        }),
        "managed-plugin://Audiomack",
    );
}

describe("recommendation wrapper logging", () => {
    it("returns empty tags and logs only provider-scoped context", async () => {
        const plugin = createAudiomackPlugin({
            getRecommendSheetTags: async () => {
                throw secretFailure;
            },
        });

        await expect(plugin.methods.getRecommendSheetTags!()).resolves.toEqual({
            data: [],
        });

        expect(devLog).toHaveBeenCalledWith(
            "error",
            "获取推荐歌单失败",
            { platform: "Audiomack" },
        );
        expect(JSON.stringify((devLog as jest.Mock).mock.calls)).not.toContain("secret");
        expect(JSON.stringify((devLog as jest.Mock).mock.calls)).not.toContain("provider response");
    });

    it("returns an empty page and redacts recommendation-page failures", async () => {
        const plugin = createAudiomackPlugin({
            getRecommendSheetsByTag: async () => {
                throw secretFailure;
            },
        });

        await expect(plugin.methods.getRecommendSheetsByTag!(
            { id: "whats-new" },
            1,
        )).resolves.toEqual({
            isEnd: true,
            data: [],
        });

        expect(devLog).toHaveBeenCalledWith(
            "error",
            "获取推荐歌单详情失败",
            { platform: "Audiomack" },
        );
        expect(JSON.stringify((devLog as jest.Mock).mock.calls)).not.toContain("secret");
        expect(JSON.stringify((devLog as jest.Mock).mock.calls)).not.toContain("provider response");
    });

    it("redacts signed request details from playlist failures", async () => {
        const plugin = createAudiomackPlugin({
            getMusicSheetInfo: async () => {
                throw secretFailure;
            },
        });

        await expect(plugin.methods.getMusicSheetInfo!(
            {
                id: "playlist-1",
                platform: "Audiomack",
                title: "Playlist",
                musicList: [],
            },
            1,
        )).resolves.toBeNull();

        expect(devLog).toHaveBeenCalledWith(
            "error",
            "获取歌单信息失败",
            { platform: "Audiomack" },
        );
        expect(JSON.stringify((devLog as jest.Mock).mock.calls)).not.toContain("secret");
        expect(JSON.stringify((devLog as jest.Mock).mock.calls)).not.toContain("provider response");
    });

    it("rethrows artist failures without logging signed request details", async () => {
        const plugin = createAudiomackPlugin({
            getArtistWorks: async () => {
                throw secretFailure;
            },
        });

        await expect(plugin.methods.getArtistWorks!(
            {
                id: "artist-1",
                platform: "Audiomack",
                name: "Artist",
                avatar: "",
                worksNum: 0,
                musicList: { id: "track-1", platform: "Audiomack" },
                albumList: {
                    id: "album-1",
                    platform: "Audiomack",
                    title: "Album",
                    description: "",
                },
            },
            1,
            "music",
        )).rejects.toBe(secretFailure);

        expect(devLog).toHaveBeenCalledWith(
            "error",
            "查询作者信息失败",
            { platform: "Audiomack" },
        );
        expect(JSON.stringify((devLog as jest.Mock).mock.calls)).not.toContain("secret");
        expect(JSON.stringify((devLog as jest.Mock).mock.calls)).not.toContain("provider response");
    });
});

describe("legacy direct media source integration", () => {
    it("normalizes a string-returning plugin through the playback wrapper", async () => {
        const url = "https://cdn.example.com/audio/song.mp3";
        const plugin = new Plugin(
            () => ({
                platform: "udio",
                cacheControl: "no-store",
                async getMediaSource() {
                    return url;
                },
            }),
            "managed-plugin://udio",
        );

        await expect(plugin.methods.getMediaSource({
            id: "track-1",
            platform: "udio",
        }, "standard")).resolves.toMatchObject({ url });
    });

    it("preserves bounded provider metadata required by native playback", async () => {
        const source = {
            url: "https://r1---sn.example.googlevideo.com/videoplayback",
            contentLength: 2_500_000,
            formatId: 140,
        };
        const plugin = new Plugin(
            () => ({
                platform: "YouTube",
                cacheControl: "no-store",
                async getMediaSource() {
                    return source;
                },
            }),
            "managed-plugin://youtube",
        );

        await expect(plugin.methods.getMediaSource({
            id: "video-1",
            platform: "YouTube",
        }, "standard")).resolves.toMatchObject(source);
    });
});
