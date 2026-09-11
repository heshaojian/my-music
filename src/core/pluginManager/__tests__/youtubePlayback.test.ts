import YOUTUBE_MANAGED_PLUGIN from "../managed/youtubePluginSource";

type AxiosGet = jest.Mock<Promise<{ data: unknown }>, [string, unknown?]>;
type AxiosPost = jest.Mock<
    Promise<{ data: unknown }>,
    [string, unknown?, unknown?]
>;

const mockGet = (
    implementation: (
        url: string,
        config?: unknown,
    ) => Promise<{ data: unknown }> = async () => ({ data: homepage() }),
): AxiosGet => jest.fn(implementation);

const mockPost = (
    implementation: (
        url: string,
        data?: unknown,
        config?: unknown,
    ) => Promise<{ data: unknown }> = async () => ({
        data: playable([audioFormat()]),
    }),
): AxiosPost => jest.fn(implementation);

type YouTubePlugin = {
    platform: string;
    version: string;
    cacheControl: string;
    supportedSearchType: string[];
    srcUrl?: string;
    search(query: string, page: number, type: string): Promise<unknown>;
    getMediaSource(
        item: { id?: unknown },
        quality: "low" | "standard" | "high" | "super",
    ): Promise<{
        url: string;
        headers?: Record<string, string>;
        quality?: "low" | "standard" | "high" | "super";
    } | null>;
};

const VIDEO_ID = "YQHsXMglC9A";
const PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const MEDIA_URL =
    "https://rr1---sn-test.googlevideo.com/videoplayback?id=public&expire=1";

function homepage(visitor = "visitor-A") {
    return `<html><script>ytcfg.set({"VISITOR_DATA":"${visitor}"});</script></html>`;
}

function playable(adaptiveFormats: unknown[] = [], formats: unknown[] = []) {
    return {
        playabilityStatus: { status: "OK" },
        streamingData: { adaptiveFormats, formats },
    };
}

function audioFormat(
    url = MEDIA_URL,
    bitrate = 128000,
    extra: Record<string, unknown> = {},
) {
    return {
        url,
        bitrate,
        mimeType: "audio/mp4; codecs=\"mp4a.40.2\"",
        audioQuality: "AUDIO_QUALITY_MEDIUM",
        ...extra,
    };
}

function createPlugin({
    get = mockGet(),
    post = mockPost(),
}: { get?: AxiosGet; post?: AxiosPost } = {}) {
    const module = { exports: {} as YouTubePlugin };
    const axios = { get, post };
    const dependencies: Record<string, unknown> = {
        axios: { default: axios },
    };
    // Mirrors the production plugin sandbox so the bundled source is tested intact.
    // eslint-disable-next-line no-new-func
    const pluginFactory = Function(`
        "use strict";
        return function(require, __musicfree_require, module, exports, console, env, URL, process) {
            ${YOUTUBE_MANAGED_PLUGIN.source}
        };
    `)();

    const requireDependency = (name: string) => dependencies[name];
    pluginFactory(
        requireDependency,
        requireDependency,
        module,
        module.exports,
        { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        { os: "ios" },
        URL,
        { env: {} },
    );
    return { plugin: module.exports, get, post };
}

describe("managed YouTube playback", () => {
    it("exports the managed identity and keeps search without a remote updater", () => {
        const { plugin } = createPlugin();

        expect(YOUTUBE_MANAGED_PLUGIN).toMatchObject({
            platform: "Youtube",
            version: "0.0.2-mymusic.1",
        });
        expect(plugin).toMatchObject({
            platform: "Youtube",
            version: "0.0.2-mymusic.1",
            cacheControl: "no-store",
            supportedSearchType: ["music"],
            search: expect.any(Function),
            getMediaSource: expect.any(Function),
        });
        expect(plugin).not.toHaveProperty("srcUrl");
        expect(YOUTUBE_MANAGED_PLUGIN.source).not.toContain("console.");
        expect(YOUTUBE_MANAGED_PLUGIN.source).not.toContain("signatureCipher");
        expect(YOUTUBE_MANAGED_PLUGIN.source).not.toContain("eval(");
        expect(YOUTUBE_MANAGED_PLUGIN.source).not.toContain("Function(");
    });

    it("preserves music search mapping", async () => {
        const searchResponse = {
            contents: {
                twoColumnSearchResultsRenderer: {
                    primaryContents: {
                        sectionListRenderer: {
                            contents: [{
                                itemSectionRenderer: {
                                    contents: [{
                                        videoRenderer: {
                                            videoId: VIDEO_ID,
                                            title: { runs: [{ text: "Hello" }] },
                                            ownerText: { runs: [{ text: "Adele" }] },
                                            thumbnail: {
                                                thumbnails: [{ url: "https://img.example/cover.jpg" }],
                                            },
                                        },
                                    }],
                                },
                            }],
                        },
                    },
                },
            },
        };
        const post = mockPost(async url => ({
            data: url.includes("/search") ? searchResponse : playable(),
        }));
        const { plugin } = createPlugin({ post });

        await expect(plugin.search("Adele Hello", 1, "music")).resolves.toEqual({
            isEnd: true,
            data: [{
                id: VIDEO_ID,
                title: "Hello",
                artist: "Adele",
                artwork: "https://img.example/cover.jpg",
            }],
        });
        expect(post).toHaveBeenCalledWith(
            "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
            expect.objectContaining({ query: "Adele Hello" }),
            expect.objectContaining({ timeout: 10000 }),
        );
    });

    it("leaves non-music search unsupported without networking", async () => {
        const { plugin, get, post } = createPlugin();

        await expect(plugin.search("Adele", 1, "album")).resolves.toBeUndefined();
        expect(get).not.toHaveBeenCalled();
        expect(post).not.toHaveBeenCalled();
    });

    it.each([
        undefined,
        null,
        "short",
        "YQHsXMglC9A ",
        "YQHsXMglC9!",
        12345678901,
    ])("rejects invalid video id %# before networking", async id => {
        const { plugin, get, post } = createPlugin();

        await expect(plugin.getMediaSource({ id }, "standard")).resolves.toBeNull();
        expect(get).not.toHaveBeenCalled();
        expect(post).not.toHaveBeenCalled();
    });

    it("bootstraps an anonymous session and sends the verified player profile", async () => {
        const { plugin, get, post } = createPlugin();

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "standard"))
            .resolves.toEqual({
                url: MEDIA_URL,
                headers: expect.objectContaining({
                    "user-agent": expect.stringContaining("youtube.vr.oculus/1.71.26"),
                }),
                quality: "standard",
            });
        expect(get).toHaveBeenCalledWith(
            "https://www.youtube.com/",
            expect.objectContaining({
                timeout: 10000,
                withCredentials: true,
                headers: expect.objectContaining({
                    "user-agent": expect.stringContaining("Safari"),
                }),
            }),
        );
        expect(post).toHaveBeenCalledWith(
            PLAYER_URL,
            expect.objectContaining({
                videoId: VIDEO_ID,
                contentCheckOk: true,
                racyCheckOk: true,
                context: {
                    client: expect.objectContaining({
                        clientName: "ANDROID_VR",
                        clientVersion: "1.71.26",
                        deviceMake: "Oculus",
                        deviceModel: "Quest 3",
                        androidSdkVersion: 32,
                    }),
                },
            }),
            expect.objectContaining({
                timeout: 10000,
                withCredentials: true,
                headers: expect.objectContaining({
                    "X-Youtube-Client-Name": "28",
                    "X-Youtube-Client-Version": "1.71.26",
                    "X-Goog-Visitor-Id": "visitor-A",
                    Origin: "https://www.youtube.com",
                }),
            }),
        );
    });

    it("reuses an in-memory session across resolutions", async () => {
        const { plugin, get } = createPlugin();

        await plugin.getMediaSource({ id: VIDEO_ID }, "standard");
        await plugin.getMediaSource({ id: "dQw4w9WgXcQ" }, "standard");

        expect(get).toHaveBeenCalledTimes(1);
    });

    it("refreshes the short-lived session after fifteen minutes", async () => {
        const now = jest.spyOn(Date, "now").mockReturnValue(1000);
        const get = mockGet()
            .mockResolvedValueOnce({ data: homepage("visitor-A") })
            .mockResolvedValueOnce({ data: homepage("visitor-B") });
        const { plugin, post } = createPlugin({ get });

        await plugin.getMediaSource({ id: VIDEO_ID }, "standard");
        now.mockReturnValue(1000 + 15 * 60 * 1000 + 1);
        await plugin.getMediaSource({ id: "dQw4w9WgXcQ" }, "standard");

        expect(get).toHaveBeenCalledTimes(2);
        expect((post.mock.calls[1][2] as { headers: Record<string, string> }).headers)
            .toMatchObject({ "X-Goog-Visitor-Id": "visitor-B" });
    });

    it("single-flights concurrent session initialization", async () => {
        let release!: (value: { data: string }) => void;
        const pending = new Promise<{ data: string }>(resolve => {
            release = resolve;
        });
        const get = mockGet(() => pending);
        const { plugin } = createPlugin({ get });

        const first = plugin.getMediaSource({ id: VIDEO_ID }, "standard");
        const second = plugin.getMediaSource({ id: "dQw4w9WgXcQ" }, "standard");
        await Promise.resolve();
        expect(get).toHaveBeenCalledTimes(1);

        release({ data: homepage() });
        await Promise.all([first, second]);
        expect(get).toHaveBeenCalledTimes(1);
    });

    it("clears failed session initialization so the next request can retry", async () => {
        const get = mockGet()
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce({ data: homepage("visitor-B") });
        const { plugin } = createPlugin({ get });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "standard"))
            .rejects.toThrow("offline");
        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "standard"))
            .resolves.toMatchObject({ url: MEDIA_URL });
        expect(get).toHaveBeenCalledTimes(2);
    });

    it.each([
        { playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in" } },
        { playabilityStatus: { status: "OK" } },
    ])("refreshes the anonymous session exactly once for a recoverable response", async first => {
        const get = mockGet()
            .mockResolvedValueOnce({ data: homepage("visitor-A") })
            .mockResolvedValueOnce({ data: homepage("visitor-B") });
        const post = mockPost()
            .mockResolvedValueOnce({ data: first })
            .mockResolvedValueOnce({ data: playable([audioFormat()]) });
        const { plugin } = createPlugin({ get, post });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "high"))
            .resolves.toMatchObject({ url: MEDIA_URL });
        expect(get).toHaveBeenCalledTimes(2);
        expect(post).toHaveBeenCalledTimes(2);
        expect((post.mock.calls[0][2] as { headers: Record<string, string> }).headers)
            .toMatchObject({ "X-Goog-Visitor-Id": "visitor-A" });
        expect((post.mock.calls[1][2] as { headers: Record<string, string> }).headers)
            .toMatchObject({ "X-Goog-Visitor-Id": "visitor-B" });
    });

    it("stops after one refresh", async () => {
        const get = mockGet()
            .mockResolvedValueOnce({ data: homepage("visitor-A") })
            .mockResolvedValueOnce({ data: homepage("visitor-B") });
        const rejected = {
            playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in" },
        };
        const post = mockPost(async () => ({ data: rejected }));
        const { plugin } = createPlugin({ get, post });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "standard"))
            .resolves.toBeNull();
        expect(get).toHaveBeenCalledTimes(2);
        expect(post).toHaveBeenCalledTimes(2);
    });

    it.each(["UNPLAYABLE", "AGE_CHECK_REQUIRED", "CONTENT_CHECK_REQUIRED", "ERROR"])(
        "does not refresh terminal status %s",
        async status => {
            const post = mockPost(async () => ({
                data: { playabilityStatus: { status } },
            }));
            const { plugin, get } = createPlugin({ post });

            await expect(plugin.getMediaSource({ id: VIDEO_ID }, "standard"))
                .resolves.toBeNull();
            expect(get).toHaveBeenCalledTimes(1);
            expect(post).toHaveBeenCalledTimes(1);
        },
    );

    it("prefers direct audio-only formats without mutating provider arrays", async () => {
        const progressive = {
            url: "https://rr1.googlevideo.com/progressive",
            bitrate: 100000,
            mimeType: "video/mp4; codecs=\"avc1.42001E, mp4a.40.2\"",
            audioQuality: "AUDIO_QUALITY_MEDIUM",
        };
        const adaptive = [audioFormat(MEDIA_URL, 128000)];
        const formats = [progressive];
        const original = JSON.parse(JSON.stringify({ adaptive, formats }));
        const post = mockPost(async () => ({
            data: playable(adaptive, formats),
        }));
        const { plugin } = createPlugin({ post });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "standard"))
            .resolves.toMatchObject({ url: MEDIA_URL });
        expect({ adaptive, formats }).toEqual(original);
    });

    it("falls back to a direct progressive format proven to contain audio", async () => {
        const progressive = {
            url: MEDIA_URL,
            bitrate: 500000,
            mimeType: "video/mp4; codecs=\"avc1.42001E, mp4a.40.2\"",
            audioQuality: "AUDIO_QUALITY_MEDIUM",
        };
        const post = mockPost(async () => ({
            data: playable([], [progressive]),
        }));
        const { plugin } = createPlugin({ post });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "super"))
            .resolves.toMatchObject({ url: MEDIA_URL });
    });

    it.each([
        ["low", 64000],
        ["standard", 128000],
        ["high", 192000],
        ["super", 320000],
    ] as const)("selects the nearest bitrate for %s", async (quality, bitrate) => {
        const candidates = [320000, 64000, 192000, 128000].map(value =>
            audioFormat(`https://rr1.googlevideo.com/${value}`, value));
        const post = mockPost(async () => ({
            data: playable(candidates),
        }));
        const { plugin } = createPlugin({ post });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, quality))
            .resolves.toMatchObject({
                url: `https://rr1.googlevideo.com/${bitrate}`,
            });
    });

    it("breaks equal-distance bitrate ties toward the lower bitrate", async () => {
        const post = mockPost(async () => ({
            data: playable([
                audioFormat("https://rr1.googlevideo.com/160", 160000),
                audioFormat("https://rr1.googlevideo.com/96000", 96000),
            ]),
        }));
        const { plugin } = createPlugin({ post });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "standard"))
            .resolves.toMatchObject({ url: "https://rr1.googlevideo.com/96000" });
    });

    it.each(["low", "standard", "high", "super"] as const)(
        "uses the sole playable candidate for %s",
        async quality => {
            const { plugin } = createPlugin();

            await expect(plugin.getMediaSource({ id: VIDEO_ID }, quality))
                .resolves.toMatchObject({ url: MEDIA_URL });
        },
    );

    it.each([
        undefined,
        null,
        {},
        { playabilityStatus: { status: "OK" }, streamingData: null },
        playable([], []),
        playable([{ signatureCipher: "secret", mimeType: "audio/mp4", bitrate: 1 }]),
        playable([{ url: MEDIA_URL, mimeType: "video/mp4", bitrate: 1 }]),
        playable([], [{
            url: MEDIA_URL,
            mimeType: "video/mp4; codecs=\"avc1.42001E, vp9\"",
            bitrate: 500000,
        }]),
    ])("returns no source for malformed or non-direct response %#", async response => {
        const post = mockPost(async () => ({ data: response }));
        const { plugin } = createPlugin({ post });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "standard"))
            .resolves.toBeNull();
    });

    it.each([
        "http://rr1.googlevideo.com/audio",
        "https://user@rr1.googlevideo.com/audio",
        "https://user:secret@rr1.googlevideo.com/audio",
        " https://rr1.googlevideo.com/audio ",
        "not a URL",
        "https://example.com/audio",
        "https://googlevideo.com.evil.example/audio",
        "https://notgooglevideo.com/audio",
        "https://rr1.googlevideo.com/audio file",
        "https://rr1.googlevideo.com/audio\nnext",
        "https://rr1.googlevideo.com/audio\r\nnext",
        "https://rr1.googlevideo.com/audio\tnext",
    ])("rejects unsafe media URL %s", async url => {
        const post = mockPost(async () => ({
            data: playable([audioFormat(url)]),
        }));
        const { plugin } = createPlugin({ post });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "standard"))
            .resolves.toBeNull();
    });

    it("rejects invalid or excessively large visitor data", async () => {
        const get = mockGet()
            .mockResolvedValueOnce({ data: homepage("visitor with spaces") })
            .mockResolvedValueOnce({ data: homepage("a".repeat(1025)) });
        const { plugin } = createPlugin({ get });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "standard"))
            .resolves.toBeNull();
        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "standard"))
            .resolves.toBeNull();
        expect(get).toHaveBeenCalledTimes(2);
    });

    it("accepts a bounded 520-character visitor value used by the live homepage", async () => {
        const get = mockGet(async () => ({ data: homepage("a".repeat(520)) }));
        const { plugin, post } = createPlugin({ get });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "standard"))
            .resolves.toMatchObject({ url: MEDIA_URL });
        expect(post).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["AUDIO_QUALITY_LOW", "low"],
        ["AUDIO_QUALITY_MEDIUM", "standard"],
        ["AUDIO_QUALITY_HIGH", "high"],
    ] as const)("reports actual provider quality %s as %s", async (
        audioQuality,
        expectedQuality,
    ) => {
        const post = mockPost(async () => ({
            data: playable([audioFormat(MEDIA_URL, 999999, { audioQuality })]),
        }));
        const { plugin } = createPlugin({ post });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "super"))
            .resolves.toMatchObject({ quality: expectedQuality });
    });

    it("reports bitrate-nearest quality when provider quality is unavailable", async () => {
        const format = audioFormat(MEDIA_URL, 120000, { audioQuality: undefined });
        const post = mockPost(async () => ({ data: playable([format]) }));
        const { plugin } = createPlugin({ post });

        await expect(plugin.getMediaSource({ id: VIDEO_ID }, "super"))
            .resolves.toMatchObject({ quality: "standard" });
    });

    it("omits actual quality when provider metadata is not meaningful", async () => {
        const format = audioFormat(MEDIA_URL, 0, { audioQuality: "UNKNOWN" });
        const post = mockPost(async () => ({ data: playable([format]) }));
        const { plugin } = createPlugin({ post });

        const result = await plugin.getMediaSource({ id: VIDEO_ID }, "super");
        expect(result).toMatchObject({ url: MEDIA_URL });
        expect(result).not.toHaveProperty("quality");
    });
});
