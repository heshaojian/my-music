import KUAISHOU_MANAGED_PLUGIN from "../kuaishouPluginSource";
import MAOERFM_MANAGED_PLUGIN from "../maoerfmPluginSource";
import SUNO_MANAGED_PLUGIN from "../sunoPluginSource";
import YINYUETAI_MANAGED_PLUGIN from "../yinyuetaiPluginSource";
import CryptoJs from "crypto-js";

type AxiosMock = {
    get: jest.Mock;
    post: jest.Mock;
    request: jest.Mock;
};

function createPlugin(
    source: string,
    axiosMock: Partial<AxiosMock> = {},
    platform = "ios",
    userVariables: Record<string, string> = {},
) {
    const module = { exports: {} } as { exports: IPlugin.IPluginInstance };
    const axios = {
        default: {
            get: jest.fn(),
            post: jest.fn(),
            request: jest.fn(),
            ...axiosMock,
        },
    };
    const dependencies: Record<string, unknown> = {
        axios,
        "crypto-js": CryptoJs,
    };

    // Mirrors the production plugin sandbox so the managed source is tested intact.
    // eslint-disable-next-line no-new-func
    const pluginFactory = Function(`
        "use strict";
        return function(require, module, exports, console, env, URL, process, XMLHttpRequest) {
            ${source}
        };
    `)();

    pluginFactory(
        (name: string) => dependencies[name],
        module,
        module.exports,
        console,
        {
            os: platform,
            locale: "en-US",
            getUserVariables: () => ({ ...userVariables }),
        },
        URL,
        { env: {} },
        function XMLHttpRequest() {},
    );

    return {
        plugin: module.exports,
        axios: axios.default as AxiosMock,
    };
}

describe("managed MaoerFM plugin source", () => {
    it("exports a non-persistent managed identity", () => {
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source);

        expect(plugin).toMatchObject({
            platform: "猫耳FM",
            version: "0.1.6-mymusic.1",
            cacheControl: "no-store",
        });
        expect(plugin).not.toHaveProperty("srcUrl");
        expect(plugin).toEqual(expect.objectContaining({
            getRecommendSheetTags: expect.any(Function),
            getRecommendSheetsByTag: expect.any(Function),
            getMusicSheetInfo: expect.any(Function),
        }));
    });

    it("maps grouped recommendation tags and drops malformed rows", async () => {
        const get = jest.fn(async () => ({
            data: {
                success: true,
                info: {
                    "Theme": [[0, "All"], [273, "Covers"], null, [28], ["", "Missing id"]],
                    "Scene": [[26310, "Gaming"]],
                    "Broken": "not-a-list",
                },
            },
        }));
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

        await expect(plugin.getRecommendSheetTags!()).resolves.toEqual({
            data: [
                {
                    title: "Theme",
                    data: [
                        { id: 0, title: "All" },
                        { id: 273, title: "Covers" },
                    ],
                },
                {
                    title: "Scene",
                    data: [{ id: 26310, title: "Gaming" }],
                },
            ],
        });
        expect(get).toHaveBeenCalledWith(
            "https://www.missevan.com/malbum/recommand",
            expect.objectContaining({
                adapter: "xhr",
                headers: expect.objectContaining({
                    referer: "https://www.missevan.com",
                }),
                timeout: 15_000,
                maxContentLength: 512 * 1024,
                maxBodyLength: 512 * 1024,
            }),
        );
        const requestConfig = (get as jest.Mock).mock.calls[0][1] as {
            signal: AbortSignal;
            onDownloadProgress: (progress: { loaded: number }) => void;
        };
        expect(requestConfig.signal.aborted).toBe(false);
        requestConfig.onDownloadProgress({ loaded: 512 * 1024 + 1 });
        expect(requestConfig.signal.aborted).toBe(true);
    });

    it.each([undefined, null, {}, { info: null }, { info: [] }])(
        "returns no recommendation tags for malformed payload %#",
        async data => {
            const get = jest.fn(async () => ({ data }));
            const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

            await expect(plugin.getRecommendSheetTags!()).resolves.toEqual({ data: [] });
        },
    );

    it("maps recommended sheets using nested pagination and safe artwork", async () => {
        const get = jest.fn(async () => ({
            data: {
                success: true,
                albums: [
                    {
                        id: 129632,
                        title: "Free collection",
                        front_cover: "https://static.maoercdn.com/covers/free.jpg",
                        music_count: 13,
                        username: "Curator",
                        user_id: 251006,
                    },
                    {
                        id: 129633,
                        title: "Unsafe artwork",
                        front_cover: "https://evil.example/cover.jpg",
                        username: "Curator",
                        user_id: 251006,
                    },
                    null,
                    {},
                    { id: 129634, title: "" },
                ],
                pagination: { p: 2, maxpage: 2 },
            },
        }));
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

        await expect(plugin.getRecommendSheetsByTag!(
            { id: "273", title: "Covers" },
            2,
        )).resolves.toEqual({
            isEnd: true,
            data: [
                {
                    id: 129632,
                    title: "Free collection",
                    artwork: "https://static.maoercdn.com/covers/free.jpg",
                    worksNum: 13,
                    artist: "Curator",
                    createUserId: 251006,
                },
                {
                    id: 129633,
                    title: "Unsafe artwork",
                    artwork: undefined,
                    artist: "Curator",
                    createUserId: 251006,
                },
            ],
        });
        expect(get).toHaveBeenCalledWith(
            "https://www.missevan.com/explore/tagalbum",
            expect.objectContaining({
                params: { order: 0, tid: 273, p: 2 },
            }),
        );
    });

    it("keeps the zero tag boundary and normalizes an invalid page", async () => {
        const get = jest.fn(async () => ({
            data: {
                albums: [],
                pagination: { p: 1, maxpage: 3 },
            },
        }));
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

        await expect(plugin.getRecommendSheetsByTag!(
            { id: "0", title: "All" },
            0,
        )).resolves.toEqual({ isEnd: false, data: [] });
        expect(get).toHaveBeenCalledWith(
            "https://www.missevan.com/explore/tagalbum",
            expect.objectContaining({
                params: { order: 0, tid: 0, p: 1 },
            }),
        );
    });

    it.each([
        undefined,
        null,
        {},
        { albums: null },
        { albums: "not-a-list", pagination: { p: 1, maxpage: 1 } },
    ])("returns an empty terminal recommendation page for malformed payload %#", async data => {
        const get = jest.fn(async () => ({ data }));
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

        await expect(plugin.getRecommendSheetsByTag!(
            { id: "0", title: "All" },
            1,
        )).resolves.toEqual({ isEnd: true, data: [] });
    });

    it("opens a sheet with free-only tracks and never exposes provider URLs", async () => {
        const get = jest.fn(async () => ({
            data: {
                success: true,
                info: {
                    sounds: [
                        {
                            id: 133535,
                            soundstr: "Free track",
                            username: "Artist",
                            pay_type: 0,
                            duration: 230321,
                            front_cover: "https://static.maoercdn.com/covers/free.jpg",
                            soundurl: "https://sound-ali-01.maoercdn.com/free.mp3",
                        },
                        {
                            id: 133536,
                            soundstr: "Paid track",
                            username: "Artist",
                            pay_type: 1,
                            soundurl: "https://sound-ali-01.maoercdn.com/paid.mp3",
                        },
                        null,
                        {},
                    ],
                },
            },
        }));
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

        const result = await plugin.getMusicSheetInfo!(
            {
                id: "129632",
                title: "Free collection",
                platform: "猫耳FM",
                musicList: [],
            },
            1,
        );
        if (!result) {
            throw new Error("Expected Maoer sheet detail");
        }
        expect(result).toEqual({
            isEnd: true,
            musicList: [{
                id: 133535,
                title: "Free track",
                artist: "Artist",
                artwork: "https://static.maoercdn.com/covers/free.jpg",
                duration: 230321,
                _maoerAlbumId: 129632,
            }],
        });
        expect(result.musicList![0]).not.toHaveProperty("url");
        await expect(plugin.getMediaSource!(
            result.musicList![0],
            "standard",
        )).resolves.toMatchObject({
            url: "https://sound-ali-01.maoercdn.com/free.mp3",
            headers: expect.objectContaining({
                referer: "https://m.missevan.com",
            }),
        });
        expect(get).toHaveBeenCalledWith(
            "https://www.missevan.com/sound/soundalllist",
            expect.objectContaining({ params: { albumid: 129632 } }),
        );
    });

    it.each([undefined, null, {}, { info: null }, { info: {} }, { info: { sounds: null } }])(
        "returns an empty sheet detail for malformed payload %#",
        async data => {
            const get = jest.fn(async () => ({ data }));
            const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

            await expect(plugin.getMusicSheetInfo!(
                {
                    id: "129632",
                    title: "Free collection",
                    platform: "猫耳FM",
                    musicList: [],
                },
                1,
            )).resolves.toEqual({ isEnd: true, musicList: [] });
        },
    );

    it.each([undefined, null, "", "../private", -1, 1.5])(
        "rejects an invalid sheet id %# without a request",
        async id => {
            const get = jest.fn();
            const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

            await expect(plugin.getMusicSheetInfo!(
                { id, title: "Invalid" } as unknown as IMusic.IMusicSheetItem,
                1,
            )).resolves.toEqual({ isEnd: true, musicList: [] });
            expect(get).not.toHaveBeenCalled();
        },
    );

    it("preserves recommendation transport errors", async () => {
        const failure = new Error("Maoer unavailable");
        const get = jest.fn(async () => {
            throw failure;
        });
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

        await expect(plugin.getRecommendSheetTags!()).rejects.toBe(failure);
    });

    it("rejects protected HLS instead of returning a DRM source", async () => {
        const get = jest.fn(async (url: string) => {
            if (url.includes("getsound")) {
                return {
                    data: {
                        info: {
                            sound: {
                                soundurl: "https://www.missevan.com/x/sound/hls.m3u8",
                            },
                        },
                    },
                };
            }
            return {
                data: "#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI=\"skd://protected\"\n",
            };
        });
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

        await expect(plugin.getMediaSource!(
            { id: "1047916", platform: "猫耳FM" },
            "standard",
        )).resolves.toBeNull();
        expect(get).toHaveBeenCalledTimes(1);
    });

    it("rejects HLS without fetching it and uses a direct fallback", async () => {
        const get = jest.fn(async () => ({
            data: {
                info: {
                    sound: {
                        soundurl: "https://www.missevan.com/x/sound/stream.m3u8?token=1",
                        soundurl_128: "https://sound-ali-01.maoercdn.com/free.m4a",
                    },
                },
            },
        }));
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

        await expect(plugin.getMediaSource!(
            { id: "fallback", platform: "猫耳FM" },
            "standard",
        )).resolves.toMatchObject({
            url: "https://sound-ali-01.maoercdn.com/free.m4a",
        });
        expect(get).toHaveBeenCalledTimes(1);
    });

    it("returns confirmed unprotected direct audio with headers", async () => {
        const get = jest.fn(async () => ({
            data: {
                info: {
                    sound: {
                        soundurl: "https://static.missevan.com/free.mp3",
                    },
                },
            },
        }));
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

        await expect(plugin.getMediaSource!(
            { id: "free", platform: "猫耳FM" },
            "standard",
        )).resolves.toMatchObject({
            url: "https://static.missevan.com/free.mp3",
            headers: expect.objectContaining({
                referer: "https://www.missevan.com/sound/player?id=free",
            }),
        });
    });

    it("accepts unprotected direct audio from the Maoer CDN", async () => {
        const get = jest.fn(async () => ({
            data: {
                info: {
                    sound: {
                        soundurl: "https://sound-ali-01.maoercdn.com/free.mp3",
                    },
                },
            },
        }));
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

        await expect(plugin.getMediaSource!(
            { id: "free", platform: "猫耳FM" },
            "standard",
        )).resolves.toMatchObject({
            url: "https://sound-ali-01.maoercdn.com/free.mp3",
        });
    });

    it.each([
        "http://sound-ali-01.maoercdn.com/free.mp3",
        "https://user:password@sound-ali-01.maoercdn.com/free.mp3",
        " https://sound-ali-01.maoercdn.com/free.mp3",
        "https://maoercdn.com.evil.example/free.mp3",
        "https://localhost/free.mp3",
    ])("rejects an unsafe Maoer media URL: %s", async soundurl => {
        const get = jest.fn(async () => ({
            data: { info: { sound: { soundurl } } },
        }));
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

        await expect(plugin.getMediaSource!(
            { id: "unsafe", platform: "猫耳FM" },
            "standard",
        )).resolves.toBeNull();
    });

    it("rejects provider-controlled media URLs outside Missevan", async () => {
        const get = jest.fn(async () => ({
            data: {
                info: {
                    sound: {
                        soundurl: "https://127.0.0.1/private.mp3",
                    },
                },
            },
        }));
        const { plugin } = createPlugin(MAOERFM_MANAGED_PLUGIN.source, { get });

        await expect(plugin.getMediaSource!(
            { id: "unsafe", platform: "猫耳FM" },
            "standard",
        )).resolves.toBeNull();
        expect(get).toHaveBeenCalledTimes(1);
    });
});

describe("managed Kuaishou plugin source", () => {
    it("exports a non-persistent managed identity", () => {
        const { plugin } = createPlugin(KUAISHOU_MANAGED_PLUGIN.source);

        expect(plugin).toMatchObject({
            platform: "快手",
            version: "0.0.5-mymusic.1",
            cacheControl: "no-store",
            userVariables: [expect.objectContaining({
                key: "cookie",
                type: "password",
            })],
        });
        expect(plugin).not.toHaveProperty("srcUrl");
    });

    it("uses the current REST search API and maps feed rows", async () => {
        const get = jest.fn(async () => ({
            headers: { "set-cookie": ["kpf=PC_WEB; Path=/", "did=web_abc; Path=/"] },
        }));
        const post = jest.fn(async () => ({
            data: {
                data: {
                    pcursor: "1",
                    feeds: [{
                        author: { name: "Creator" },
                        photo: {
                            id: "photo-1",
                            caption: "Track",
                            coverUrl: "https://img.example.com/cover.jpg",
                            manifest: {
                                adaptationSet: [{
                                    representation: [{
                                        url: "https://v1.kwaicdn.com/audio.mp4?token=transient",
                                    }],
                                }],
                            },
                        },
                    }],
                },
            },
        }));
        const { plugin } = createPlugin(KUAISHOU_MANAGED_PLUGIN.source, { get, post });

        const result = await plugin.search!("music", 1, "music");
        expect(result.data).toMatchObject([{
            id: "photo-1",
            title: "Track",
            artist: "Creator",
        }]);
        expect(result.data![0]).not.toHaveProperty("manifest");
        expect(result.data![0]).not.toHaveProperty("manifestH265");
        expect(result.data![0]).not.toHaveProperty("videoResource");
        expect(post).toHaveBeenCalledWith(
            "https://www.kuaishou.com/rest/v/search/feed",
            expect.objectContaining({
                keyword: "music",
                page: "search",
                webPageArea: "search_video",
                pcursor: "",
            }),
            expect.objectContaining({
                headers: expect.objectContaining({
                    "content-type": "application/json",
                    cookie: expect.stringContaining("kpf=PC_WEB"),
                }),
                withCredentials: true,
            }),
        );
        await expect(plugin.getMediaSource!(result.data![0], "standard"))
            .resolves.toEqual({
                url: "https://v1.kwaicdn.com/audio.mp4?token=transient",
            });
    });

    it("treats a login-gated REST response as an empty page", async () => {
        const post = jest.fn(async () => ({
            data: {
                result: 2,
                error_msg: null,
            },
        }));
        const { plugin } = createPlugin(KUAISHOU_MANAGED_PLUGIN.source, { post });

        await expect(plugin.search!("music", 1, "music"))
            .resolves.toEqual({ isEnd: true, data: [] });
    });

    it("uses an optional securely stored sign-in cookie without requesting an anonymous one", async () => {
        const get = jest.fn();
        const post = jest.fn(async () => ({ data: { data: { feeds: [] } } }));
        const { plugin } = createPlugin(
            KUAISHOU_MANAGED_PLUGIN.source,
            { get, post },
            "ios",
            { cookie: "userId=123; token=secret" },
        );

        await plugin.search!("music", 1, "music");

        expect(get).not.toHaveBeenCalled();
        expect(post).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Object),
            expect.objectContaining({
                headers: expect.objectContaining({
                    cookie: "userId=123; token=secret",
                }),
            }),
        );
    });
});

describe("managed Suno plugin source", () => {
    it("does not call the suspended API while mounting", () => {
        const get = jest.fn();
        const { plugin } = createPlugin(SUNO_MANAGED_PLUGIN.source, { get });

        expect(plugin.platform).toBe("suno");
        expect(get).not.toHaveBeenCalled();
    });

    it("maps public playlist clips from the current Suno page", async () => {
        const payload = JSON.stringify({
            playlist_clips: [{
                clip: {
                    id: "clip-1",
                    audio_url: "https://studio-api.prod.suno.com/api/forbidden",
                    video_url: "https://cdn1.suno.ai/clip.mp4",
                    media_urls: [{
                        url: "https://d2lwuy8qc234o3.cloudfront.net/1/clip/clip-1.m4a",
                        content_type: "m4a-opus",
                    }],
                    image_url: "https://cdn1.suno.ai/image.jpg",
                    title: "Suno Track",
                    display_name: "Artist",
                    user_id: "user-1",
                    metadata: { duration: 12, prompt: "lyrics" },
                },
            }],
        });
        const html = `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`;
        const get = jest.fn(async () => ({ data: html }));
        const { plugin } = createPlugin(SUNO_MANAGED_PLUGIN.source, { get }, "ios");

        await expect(plugin.getTopListDetail!({
            id: "playlist",
            title: "Playlist",
            platform: "suno",
        }, 1)).resolves.toMatchObject({
            musicList: [{
                id: "clip-1",
                url: "https://cdn1.suno.ai/clip.mp4",
                title: "Suno Track",
            }],
        });
        expect(get).toHaveBeenCalledWith(
            "https://suno.com/playlist/playlist",
            expect.anything(),
        );
        expect(get).not.toHaveBeenCalledWith(
            expect.stringContaining("studio-api.suno.ai"),
            expect.anything(),
        );
    });

    it("prefers the direct audio rendition on Android", async () => {
        const payload = JSON.stringify({
            playlist_clips: [{
                clip: {
                    id: "clip-1",
                    video_url: "https://cdn1.suno.ai/clip.mp4",
                    media_urls: [{
                        url: "https://d2lwuy8qc234o3.cloudfront.net/1/clip/clip-1.m4a",
                        content_type: "m4a-opus",
                    }],
                    title: "Suno Track",
                },
            }],
        });
        const html = `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`;
        const get = jest.fn(async () => ({ data: html }));
        const { plugin } = createPlugin(SUNO_MANAGED_PLUGIN.source, { get }, "android");

        await expect(plugin.getTopListDetail!({
            id: "playlist",
            title: "Playlist",
            platform: "suno",
        }, 1)).resolves.toMatchObject({
            musicList: [{
                url: "https://d2lwuy8qc234o3.cloudfront.net/1/clip/clip-1.m4a",
            }],
        });
    });
});

describe("managed Yinyuetai plugin source", () => {
    it("exports a non-persistent managed identity", () => {
        const { plugin } = createPlugin(YINYUETAI_MANAGED_PLUGIN.source);

        expect(plugin).toMatchObject({
            platform: "音悦台",
            version: "0.0.3-mymusic.1",
            cacheControl: "no-store",
        });
        expect(plugin).not.toHaveProperty("srcUrl");
    });

    it("searches the live channel catalog and keeps transient URLs in memory", async () => {
        const get = jest.fn(async (url: string) => {
            if (url.endsWith("/video/explore/channels")) {
                return {
                    data: {
                        code: 0,
                        data: [{ id: "channel-1", channelName: "Pop" }],
                    },
                };
            }
            return {
                data: {
                    code: 0,
                    data: [{
                        id: "video-1",
                        title: "Track Video",
                        allArtistNames: "Artist",
                        fullClip: {
                            urls: [
                                { streamType: 1, url: "https://video.yinyuetai.com/high.mp4" },
                                { streamType: 5, url: "https://video.yinyuetai.com/standard.mp4" },
                            ],
                        },
                    }],
                },
            };
        });
        const { plugin } = createPlugin(YINYUETAI_MANAGED_PLUGIN.source, { get });

        const result = await plugin.search!("Track", 1, "music");
        expect(result.data).toMatchObject([{
            id: "video-1",
            title: "Track Video",
            artist: "Artist",
        }]);
        expect(result.data![0]).not.toHaveProperty("urls");
        expect(get).toHaveBeenCalledWith(
            "https://video-api.yinyuetai.com/video/explore/channelVideos",
            expect.objectContaining({
                params: expect.objectContaining({ channelId: "channel-1" }),
                headers: expect.objectContaining({
                    pp: expect.stringMatching(/^[a-f0-9]{40}$/),
                    vi: "1.0.0;11;101",
                }),
            }),
        );

        await expect(plugin.getMediaSource!({
            id: "video-1",
            platform: "音悦台",
        }, "standard")).resolves.toEqual({
            url: "https://video.yinyuetai.com/standard.mp4",
        });
    });

    it("exposes current provider channels as working top lists", async () => {
        const get = jest.fn(async (url: string) => ({
            data: url.endsWith("/video/explore/channels")
                ? { code: 0, data: [{ id: "channel-1", channelName: "Pop" }] }
                : {
                    code: 0,
                    data: [{
                        id: "video-1",
                        title: "Video",
                        fullClip: {
                            urls: [{
                                streamType: 5,
                                url: "https://video.yinyuetai.com/standard.mp4",
                            }],
                        },
                    }],
                },
        }));
        const { plugin } = createPlugin(YINYUETAI_MANAGED_PLUGIN.source, { get });

        await expect(plugin.getTopLists!()).resolves.toEqual([{
            title: "Yinyuetai Channels",
            data: [{ id: "channel-1", title: "Pop" }],
        }]);
        await expect(plugin.getTopListDetail!({
            id: "channel-1",
            title: "Pop",
            platform: "音悦台",
        }, 1)).resolves.toMatchObject({
            musicList: [{ id: "video-1", title: "Video" }],
        });
    });

    it("keeps searchable rows but rejects the current provider CDN hostname with broken TLS", async () => {
        const get = jest.fn(async (url: string) => ({
            data: url.endsWith("/video/explore/channels")
                ? { code: 0, data: [{ id: "channel-1", channelName: "Pop" }] }
                : {
                    code: 0,
                    data: [{
                        id: "video-1",
                        title: "Video",
                        fullClip: {
                            urls: [{
                                streamType: 1,
                                url: "https://cloud-cdn.yinyuetai.com/video.mp4?sign=transient",
                            }],
                        },
                    }],
                },
        }));
        const { plugin } = createPlugin(YINYUETAI_MANAGED_PLUGIN.source, { get });

        await expect(plugin.search!("Video", 1, "music")).resolves.toEqual({
            isEnd: true,
            data: [expect.objectContaining({
                id: "video-1",
                title: "Video",
            })],
        });
        await expect(plugin.getMediaSource!({
            id: "video-1",
            platform: "音悦台",
        }, "standard")).resolves.toBeNull();
    });
});
