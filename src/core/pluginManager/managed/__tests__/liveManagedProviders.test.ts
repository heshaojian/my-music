import axios from "axios";
import * as cheerio from "cheerio";
import CryptoJs from "crypto-js";
import dayjs from "dayjs";
import he from "he";

jest.mock("@/utils/log", () => ({
    errorLog: jest.fn(),
}));

import AUDIOMACK from "../audiomackPluginSource";
import BILIBILI from "../bilibiliPluginSource";
import GECIQIANXUN from "../geciqianxunPluginSource";
import GECIWANG from "../geciwangPluginSource";
import KUAISHOU from "../kuaishouPluginSource";
import MAOERFM from "../maoerfmPluginSource";
import NAVIDROME from "../navidromePluginSource";
import SUNO from "../sunoPluginSource";
import UDIO from "../udioPluginSource";
import WEBDAV from "../webdavPluginSource";
import YINYUETAI from "../yinyuetaiPluginSource";
import YOUTUBE from "../youtubePluginSource";
import { BUNDLED_MANAGED_PLUGINS } from "../ensureBundledManagedPlugins";

const liveTestsEnabled = process.env.LIVE_MANAGED_PLUGIN_TESTS === "1";
const livePluginOs = process.env.LIVE_PLUGIN_OS === "android" ? "android" : "ios";
const liveCredentials = Object.freeze({
    kuaishouCookie: process.env.KUAISHOU_COOKIE,
    navidromeUrl: process.env.NAVIDROME_URL,
    navidromeUsername: process.env.NAVIDROME_USERNAME,
    navidromePassword: process.env.NAVIDROME_PASSWORD,
    webdavUrl: process.env.WEBDAV_URL,
    webdavUsername: process.env.WEBDAV_USERNAME,
    webdavPassword: process.env.WEBDAV_PASSWORD,
});
const originalLiveTestEnvironment = { ...process.env };
const liveDescribe = liveTestsEnabled
    ? describe
    : describe.skip;

function replaceProcessEnvironment(values: NodeJS.ProcessEnv) {
    for (const key of Object.keys(process.env)) {
        delete process.env[key];
    }
    Object.assign(process.env, values);
}

type Descriptor = {
    platform: string;
    version: string;
    source: string;
};

type RuntimePlugin = {
    platform: string;
    search?: (query: string, page: number, type: string) => Promise<any>;
    getMediaSource?: (item: any, quality?: string) => Promise<any>;
    getLyric?: (item: any) => Promise<any>;
    getTopLists?: () => Promise<any[]> | any[];
    getTopListDetail?: (item: any, page?: number) => Promise<any>;
};

const descriptors: readonly Descriptor[] = BUNDLED_MANAGED_PLUGINS;

const descriptorByPlatform = new Map(
    descriptors.map(descriptor => [descriptor.platform, descriptor]),
);

function managedPlugin(platform: string) {
    const descriptor = descriptorByPlatform.get(platform);
    if (!descriptor) {
        throw new Error(`Managed plugin missing from app registry: ${platform}`);
    }
    return descriptor;
}

function createPlugin(
    descriptor: Descriptor,
    userVariables: Record<string, string> = {},
): RuntimePlugin {
    const module = { exports: {} as RuntimePlugin };
    const dependencies: Record<string, unknown> = {
        axios: { default: axios },
        cheerio,
        "crypto-js": CryptoJs,
        dayjs,
        he,
    };
    const requireDependency = (name: string) => {
        if (name === "webdav") {
            return require(name);
        }
        return dependencies[name];
    };

    // This is the same CommonJS function boundary used by the app runtime.
    // eslint-disable-next-line no-new-func
    const factory = Function(`
        "use strict";
        return function(require, __musicfree_require, module, exports, console, env, URL, process) {
            ${descriptor.source}
        };
    `)();
    factory(
        requireDependency,
        requireDependency,
        module,
        module.exports,
        { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
        {
            os: livePluginOs,
            locale: "en-US",
            getUserVariables: () => ({ ...userVariables }),
        },
        URL,
        { env: {} },
    );
    return module.exports;
}

function rows(result: any) {
    return Array.isArray(result?.data) ? result.data : [];
}

async function firstMediaSource(plugin: RuntimePlugin, items: any[]) {
    const failures: string[] = [];
    for (const item of items.slice(0, 10)) {
        try {
            const source = await plugin.getMediaSource?.(item, "standard");
            if (source?.url) {
                return source;
            }
        } catch (error) {
            failures.push(error instanceof Error ? error.message : String(error));
        }
    }
    if (failures.length > 0) {
        throw new Error(`No playable media source found; provider errors: ${failures.join("; ")}`);
    }
    return null;
}

async function assertReachableMedia(source: any) {
    expect(source?.url).toEqual(expect.any(String));
    const parsed = new URL(source.url);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.username).toBe("");
    expect(parsed.password).toBe("");

    const response = await axios.get(source.url, {
        headers: {
            ...(source.headers ?? {}),
            Range: "bytes=0-1",
        },
        maxRedirects: 5,
        responseType: "arraybuffer",
        timeout: 20_000,
        validateStatus: status => status >= 200 && status < 400,
    });
    expect(response.data.byteLength).toBeGreaterThan(0);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(400);
}

liveDescribe("live managed provider compatibility", () => {
    jest.setTimeout(120_000);

    beforeAll(() => {
        // Embedded plugin code can access globalThis.process even though its
        // injected process object is empty. Keep unrelated developer/CI
        // secrets out of the opt-in runtime; provider credentials are passed
        // only through the same user-variable boundary used by the app.
        replaceProcessEnvironment({});
    });

    afterAll(() => {
        replaceProcessEnvironment(originalLiveTestEnvironment);
    });

    it("matches the current official recommendation catalog", async () => {
        const response = await axios.get(
            "https://raw.githubusercontent.com/maotoumao/MusicFreePlugins/master/plugins.json",
            { timeout: 20_000 },
        );
        const officialNames = response.data.plugins
            .map((plugin: { name: string }) => plugin.name)
            .sort();
        expect(descriptors.map(plugin => plugin.platform).sort()).toEqual(officialNames);
        expect(descriptors).toBe(BUNDLED_MANAGED_PLUGINS);
    });

    it("searches and resolves reachable YouTube audio", async () => {
        const plugin = createPlugin(managedPlugin(YOUTUBE.platform));
        const result = await plugin.search!("Adele Hello", 1, "music");
        expect(rows(result).length).toBeGreaterThan(0);
        await assertReachableMedia(await firstMediaSource(plugin, rows(result)));
    });

    it("searches and resolves reachable Audiomack audio", async () => {
        const plugin = createPlugin(managedPlugin(AUDIOMACK.platform));
        const result = await plugin.search!("Adele", 1, "music");
        expect(rows(result).length).toBeGreaterThan(0);
        await assertReachableMedia(await firstMediaSource(plugin, rows(result)));
    });

    it("searches and resolves reachable Bilibili audio", async () => {
        const plugin = createPlugin(managedPlugin(BILIBILI.platform));
        const result = await plugin.search!("周杰伦", 1, "music");
        expect(rows(result).length).toBeGreaterThan(0);
        await assertReachableMedia(await firstMediaSource(plugin, rows(result)));
    });

    it("searches and loads lyrics from FollowLyrics", async () => {
        const plugin = createPlugin(managedPlugin(GECIWANG.platform));
        const result = await plugin.search!("Hello", 1, "lyric");
        expect(rows(result).length).toBeGreaterThan(0);
        const lyric = await plugin.getLyric!(rows(result)[0]);
        expect(lyric?.rawLrc?.length).toBeGreaterThan(20);
    });

    it("searches and loads lyrics from LRCLIB", async () => {
        const plugin = createPlugin(managedPlugin(GECIQIANXUN.platform));
        const result = await plugin.search!("Adele Hello", 1, "lyric");
        expect(rows(result).length).toBeGreaterThan(0);
        const lyric = await plugin.getLyric!(rows(result)[0]);
        expect(lyric?.rawLrc?.length).toBeGreaterThan(20);
    });

    it("loads current Suno recommendations with reachable media", async () => {
        const plugin = createPlugin(managedPlugin(SUNO.platform));
        const lists = await plugin.getTopLists!();
        const result = await plugin.getTopListDetail!(lists[0].data[0]);
        expect(result.musicList.length).toBeGreaterThan(0);
        await assertReachableMedia({ url: result.musicList[0].url });
    });

    it("searches Udio and resolves reachable media", async () => {
        const plugin = createPlugin(managedPlugin(UDIO.platform));
        const result = await plugin.search!("love", 1, "music");
        expect(rows(result).length).toBeGreaterThan(0);
        await assertReachableMedia(await firstMediaSource(plugin, rows(result)));
    });

    it("loads MaoerFM search results and safely classifies their media", async () => {
        const plugin = createPlugin(managedPlugin(MAOERFM.platform));
        const result = await plugin.search!("翻唱", 1, "music");
        expect(rows(result).length).toBeGreaterThan(0);
        const source = await firstMediaSource(plugin, rows(result));
        if (source) {
            await assertReachableMedia(source);
        }
    });

    it("loads Yinyuetai search results and validates any direct media", async () => {
        const plugin = createPlugin(managedPlugin(YINYUETAI.platform));
        const result = await plugin.search!("周杰伦", 1, "music");
        expect(rows(result).length).toBeGreaterThan(0);
        const source = await firstMediaSource(plugin, rows(result));
        if (source) {
            await assertReachableMedia(source);
        }
    });

    const kuaishouCookie = liveCredentials.kuaishouCookie;
    (kuaishouCookie ? it : it.skip)("searches Kuaishou with a supplied session", async () => {
        const plugin = createPlugin(managedPlugin(KUAISHOU.platform), { cookie: kuaishouCookie! });
        const result = await plugin.search!("音乐", 1, "music");
        expect(rows(result).length).toBeGreaterThan(0);
        await assertReachableMedia(await firstMediaSource(plugin, rows(result)));
    });

    const navidromeConfigured = liveCredentials.navidromeUrl &&
        liveCredentials.navidromeUsername && liveCredentials.navidromePassword;
    (navidromeConfigured ? it : it.skip)("searches a configured Navidrome server", async () => {
        const plugin = createPlugin(managedPlugin(NAVIDROME.platform), {
            url: liveCredentials.navidromeUrl!,
            username: liveCredentials.navidromeUsername!,
            password: liveCredentials.navidromePassword!,
        });
        const result = await plugin.search!("a", 1, "music");
        expect(Array.isArray(result.data)).toBe(true);
    });

    const webdavConfigured = liveCredentials.webdavUrl &&
        liveCredentials.webdavUsername && liveCredentials.webdavPassword;
    (webdavConfigured ? it : it.skip)("loads a configured WebDAV library", async () => {
        const plugin = createPlugin(managedPlugin(WEBDAV.platform), {
            url: liveCredentials.webdavUrl!,
            username: liveCredentials.webdavUsername!,
            password: liveCredentials.webdavPassword!,
        });
        const lists = await plugin.getTopLists!();
        expect(lists.length).toBeGreaterThan(0);
    });
});
