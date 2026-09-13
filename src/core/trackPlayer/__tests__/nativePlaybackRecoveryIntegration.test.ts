const mockEventListeners = new Map<
    string,
    (event: Record<string, unknown>) => Promise<void>
>();
const mockPrepareIosGoogleVideoSource = jest.fn(
    async ({
        source,
    }: {
        source: IPlugin.IMediaSourceResult;
        shouldAbort?: () => boolean;
    }) =>
        typeof source.url === "string" &&
        source.url.includes("googlevideo.com") &&
        source.url.includes("clen=")
            ? {
                ...source,
                url: "file:///cache/mymusic-youtube/prepared.m4a",
                headers: undefined,
            }
            : source,
);

jest.mock("react-native-reanimated", () => ({
    Easing: {
        exp: jest.fn(),
        out: jest.fn((value: unknown) => value),
    },
}));

jest.mock("react-native-track-player", () => ({
    __esModule: true,
    default: {
        addEventListener: jest.fn(
            (
                event: string,
                listener: (payload: Record<string, unknown>) => Promise<void>,
            ) => {
                mockEventListeners.set(event, listener);
                return { remove: jest.fn() };
            },
        ),
        getActiveTrack: jest.fn(),
        getActiveTrackIndex: jest.fn(async () => 0),
        getTrack: jest.fn(async () => undefined),
        getProgress: jest.fn(async () => ({ position: 27, duration: 180 })),
        getPlaybackState: jest.fn(async () => ({ state: "playing" })),
        getRate: jest.fn(async () => 1),
        pause: jest.fn(async () => undefined),
        play: jest.fn(async () => undefined),
        reset: jest.fn(async () => undefined),
        seekTo: jest.fn(async () => undefined),
        setQueue: jest.fn(async () => undefined),
        setRate: jest.fn(async () => undefined),
        setupPlayer: jest.fn(async () => undefined),
        skip: jest.fn(async () => undefined),
        updateMetadataForTrack: jest.fn(async () => undefined),
    },
    Event: {
        PlaybackActiveTrackChanged: "playback-active-track-changed",
        PlaybackError: "playback-error",
    },
    State: {
        Error: "error",
        Paused: "paused",
        Playing: "playing",
        Stopped: "stopped",
    },
    usePlaybackState: jest.fn(() => ({ state: "playing" })),
    useProgress: jest.fn(),
}));

jest.mock("@/utils/persistStatus", () => ({
    __esModule: true,
    default: {
        get: jest.fn(() => undefined),
        set: jest.fn(),
    },
}));

jest.mock("@/components/dialogs/useDialog", () => ({
    getCurrentDialog: jest.fn(() => null),
    showDialog: jest.fn(),
}));

jest.mock("@/core/localMusicSheet", () => ({
    __esModule: true,
    default: {
        isLocalMusic: jest.fn(() => undefined),
    },
}));

jest.mock("@/utils/fileUtils", () => ({
    resolveImportedAssetOrPath: jest.fn((value: unknown) => value),
}));

jest.mock("@/utils/log", () => ({
    errorLog: jest.fn(),
    trace: jest.fn(),
}));

jest.mock("@/utils/delay", () => ({
    __esModule: true,
    default: jest.fn(async () => undefined),
}));

jest.mock("@/utils/network", () => ({
    __esModule: true,
    default: { isCellular: false },
}));

jest.mock("@/utils/mediaUtils", () => ({
    getLocalPath: jest.fn(() => null),
    isSameMediaItem: jest.fn((left, right) =>
        Boolean(
            left &&
                right &&
                left.id === right.id &&
                left.platform === right.platform,
        ),
    ),
}));

jest.mock("react-native-url-polyfill", () => ({ URL }));

jest.mock("../iosGoogleVideoCache", () => ({
    prepareIosGoogleVideoSource: (options: {
        source: IPlugin.IMediaSourceResult;
        shouldAbort?: () => boolean;
    }) => mockPrepareIosGoogleVideoSource(options),
}));

jest.mock("@/core/i18n", () => ({
    __esModule: true,
    default: { t: jest.fn((key: string) => key) },
}));

import trackPlayer from "../index";

describe("TrackPlayer native playback recovery integration", () => {
    it("replaces a dead provider URL once and keeps the original track identity", async () => {
        const originalTrack = {
            id: "original-1",
            platform: "音悦台",
            title: "Hello",
            artist: "Adele",
            artwork: "cover.jpg",
        } as IMusic.IMusicItem;
        const directSource = "https://media.yinyuetai.com/dead.m4a";
        const fallbackSource =
            "https://rr1.googlevideo.com/audio.m4a?clen=1000";
        const originalProvider = {
            name: "音悦台",
            methods: {
                getMediaSource: jest.fn(async (item: IMusic.IMusicItem) =>
                    item.id === "initial-fallback" ? null : { url: directSource },
                ),
            },
        };
        const youtubeProvider = {
            name: "Youtube",
            methods: {
                search: jest.fn(async (query: string) => ({
                    data: [
                        {
                            id: query.includes("Skyfall")
                                ? "youtube-skyfall"
                                : "youtube-hello",
                            platform: "Youtube",
                            title: query.includes("Skyfall")
                                ? "Skyfall"
                                : "Hello",
                            artist: "Adele",
                        },
                    ],
                })),
                getMediaSource: jest.fn(async (item: IMusic.IMusicItem) => ({
                    url:
                        item.id === "youtube-skyfall"
                            ? "https://rr1.googlevideo.com/skyfall.m4a"
                            : fallbackSource,
                    headers: { Referer: "https://www.youtube.com/" },
                })),
            },
        };
        const audiomackProvider = {
            name: "Audiomack",
            methods: {
                search: jest.fn(async () => ({
                    data: [
                        {
                            id: "audiomack-skyfall",
                            platform: "Audiomack",
                            title: "Skyfall",
                            artist: "Adele",
                        },
                    ],
                })),
                getMediaSource: jest.fn(async () => ({
                    url: "https://music.audiomack.com/skyfall.m4a",
                })),
            },
        };
        const configValues: Record<string, unknown> = {
            "basic.defaultPlayQuality": "standard",
            "basic.playQualityOrder": "asc",
            "basic.tryChangeSourceWhenPlayFail": true,
            "basic.useCelluarNetworkPlay": true,
        };
        const config = {
            getConfig: jest.fn((key: string) => configValues[key]),
            setConfig: jest.fn(),
            setup: jest.fn(async () => undefined),
        };
        const history = {
            history: [],
            addMusic: jest.fn(async () => undefined),
            clearHistory: jest.fn(async () => undefined),
            removeMusic: jest.fn(async () => undefined),
            setHistory: jest.fn(async () => undefined),
            setup: jest.fn(async () => undefined),
        };
        const pluginManager = {
            getByName: jest.fn((name: string) =>
                name === originalProvider.name ? originalProvider : undefined,
            ),
            getSearchablePlugins: jest.fn(() => [
                youtubeProvider,
                audiomackProvider,
            ]),
        };

        trackPlayer.injectDependencies(
            config as never,
            history as never,
            pluginManager as never,
        );
        await trackPlayer.setupTrackPlayer();
        await trackPlayer.play(originalTrack);

        const { errorLog } = jest.requireMock("@/utils/log");
        const nativeTrackPlayer = jest.requireMock(
            "react-native-track-player",
        ).default;
        const persistStatus = jest.requireMock("@/utils/persistStatus").default;
        expect(errorLog).not.toHaveBeenCalledWith(
            "播放失败",
            expect.anything(),
        );
        expect(trackPlayer.currentMusic).toEqual(
            expect.objectContaining({
                id: originalTrack.id,
                platform: originalTrack.platform,
            }),
        );
        expect(originalProvider.methods.getMediaSource).toHaveBeenCalled();
        expect(nativeTrackPlayer.setQueue).toHaveBeenLastCalledWith([
            expect.objectContaining({
                id: originalTrack.id,
                platform: originalTrack.platform,
                url: directSource,
            }),
            expect.any(Object),
        ]);

        nativeTrackPlayer.getActiveTrack.mockResolvedValue({
            ...originalTrack,
            url: directSource,
        });
        const playbackErrorListener = mockEventListeners.get("playback-error");
        expect(playbackErrorListener).toBeDefined();

        await playbackErrorListener?.({
            code: "network",
            message: "source unavailable",
        });

        expect(youtubeProvider.methods.search).toHaveBeenCalledTimes(1);
        expect(nativeTrackPlayer.setQueue).toHaveBeenLastCalledWith([
            expect.objectContaining({
                id: originalTrack.id,
                platform: originalTrack.platform,
                title: originalTrack.title,
                url: "file:///cache/mymusic-youtube/prepared.m4a",
            }),
            expect.any(Object),
        ]);
        expect(mockPrepareIosGoogleVideoSource).toHaveBeenCalledWith({
            source: expect.objectContaining({ url: fallbackSource }),
            mediaId: originalTrack.id,
            shouldAbort: expect.any(Function),
        });
        expect(nativeTrackPlayer.seekTo).toHaveBeenCalledWith(27);
        expect(persistStatus.set).toHaveBeenCalledWith(
            "music.musicItem",
            expect.objectContaining({
                id: originalTrack.id,
                platform: originalTrack.platform,
            }),
        );
        expect(persistStatus.set).not.toHaveBeenCalledWith(
            "music.musicItem",
            expect.objectContaining({ url: fallbackSource }),
        );
        expect(persistStatus.set).not.toHaveBeenCalledWith(
            "music.musicItem",
            expect.objectContaining({
                url: "file:///cache/mymusic-youtube/prepared.m4a",
            }),
        );

        await playbackErrorListener?.({
            code: "network",
            message: "source unavailable again",
        });
        expect(youtubeProvider.methods.search).toHaveBeenCalledTimes(1);

        const fallbackTrack = {
            id: "initial-fallback",
            platform: "音悦台",
            title: "Skyfall",
            artist: "Adele",
            artwork: "cover.jpg",
        } as IMusic.IMusicItem;
        await trackPlayer.play(fallbackTrack);
        expect(youtubeProvider.methods.search).toHaveBeenCalledTimes(2);
        expect(audiomackProvider.methods.search).not.toHaveBeenCalled();

        nativeTrackPlayer.getActiveTrack.mockResolvedValue({
            ...fallbackTrack,
            url: "https://rr1.googlevideo.com/skyfall.m4a",
        });
        await playbackErrorListener?.({
            code: "network",
            message: "initial fallback source unavailable",
        });

        expect(youtubeProvider.methods.search).toHaveBeenCalledTimes(2);
        expect(audiomackProvider.methods.search).toHaveBeenCalledTimes(1);
        expect(nativeTrackPlayer.setQueue).toHaveBeenLastCalledWith([
            expect.objectContaining({
                id: fallbackTrack.id,
                platform: fallbackTrack.platform,
                title: fallbackTrack.title,
                url: "https://music.audiomack.com/skyfall.m4a",
            }),
            expect.any(Object),
        ]);
    });
});
