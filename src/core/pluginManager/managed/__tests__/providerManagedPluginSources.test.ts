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
        return function(require, module, exports, console, env, URL, process) {
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
            version: "0.1.5-mymusic.1",
            cacheControl: "no-store",
        });
        expect(plugin).not.toHaveProperty("srcUrl");
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
