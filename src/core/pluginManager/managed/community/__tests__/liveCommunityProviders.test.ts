import axios from "axios";
import bigInt from "big-integer";
import * as cheerio from "cheerio";
import CryptoJs from "crypto-js";
import dayjs from "dayjs";
import he from "he";
import qs from "qs";

import { COMMUNITY_MANAGED_PLUGINS } from "../communityPluginRegistry";

const liveTestsEnabled = process.env.LIVE_COMMUNITY_PLUGIN_TESTS === "1";
const liveDescribe = liveTestsEnabled ? describe : describe.skip;
const originalEnvironment = { ...process.env };

type RuntimePlugin = {
    platform: string;
    supportedSearchType?: string[];
    search?: (query: string, page: number, type: string) => Promise<unknown>;
    getMediaSource?: (
        item: Record<string, unknown>,
        quality: string,
    ) => Promise<unknown>;
};

type ProviderCase = {
    platform: string;
    query: string;
    allowedHosts: readonly string[];
};

const providerCases: readonly ProviderCase[] = Object.freeze([
    { platform: "网易云", query: "音乐", allowedHosts: ["music.163.com", "music.126.net"] },
    { platform: "酷我", query: "音乐", allowedHosts: ["kuwo.cn"] },
]);

function replaceProcessEnvironment(values: NodeJS.ProcessEnv) {
    for (const key of Object.keys(process.env)) {
        delete process.env[key];
    }
    Object.assign(process.env, values);
}

function mountPlugin(source: string): RuntimePlugin {
    const module = { exports: {} as RuntimePlugin };
    const dependencies: Record<string, unknown> = {
        axios: { default: axios },
        "big-integer": bigInt,
        cheerio,
        "crypto-js": CryptoJs,
        dayjs,
        he,
        qs,
    };
    const requireDependency = (name: string) => dependencies[name];

    // Match the CommonJS boundary used by the app without exposing host secrets.
    // eslint-disable-next-line no-new-func
    const factory = Function(`
        "use strict";
        return function(require, __musicfree_require, module, exports, console, env, URL, process) {
            ${source}
        };
    `)();
    factory(
        requireDependency,
        requireDependency,
        module,
        module.exports,
        { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
        {
            os: "ios",
            locale: "en-US",
            getUserVariables: () => ({}),
        },
        URL,
        { env: {} },
    );
    return module.exports;
}

function safeFailureKind(error: unknown) {
    if (axios.isAxiosError(error)) {
        if (error.response?.status) {
            return `HTTP ${error.response.status}`;
        }
        return error.code ? `network ${error.code}` : "network error";
    }
    return error instanceof Error ? error.name : "unknown error";
}

async function callProvider<T>(
    platform: string,
    operation: string,
    call: () => Promise<T>,
) {
    try {
        return await call();
    } catch (error) {
        // Never include provider URLs, request configuration, or response bodies.
        throw new Error(
            `${platform}: ${operation} failed (${safeFailureKind(error)})`,
        );
    }
}

function rows(result: unknown): Record<string, unknown>[] {
    if (!result || typeof result !== "object") {
        return [];
    }
    const data = (result as { data?: unknown }).data;
    return Array.isArray(data)
        ? data.filter(item => item !== null && typeof item === "object")
        : [];
}

function isValidSearchItem(item: Record<string, unknown>) {
    const idType = typeof item.id;
    return (idType === "string" || idType === "number") &&
        typeof item.title === "string" && item.title.length > 0;
}

function isApprovedMediaUrl(value: unknown, allowedHosts: readonly string[]) {
    if (typeof value !== "string") {
        return false;
    }
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" &&
            parsed.username === "" &&
            parsed.password === "" &&
            allowedHosts.some(host =>
                parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
    } catch {
        return false;
    }
}

function reportNoLiveData(platform: string, stage: "search" | "playback") {
    console.warn(
        `[live community plugins] ${platform}: ${stage} returned no usable data; ` +
        "the provider check is non-actionable for this run",
    );
}

liveDescribe("live community provider compatibility", () => {
    jest.setTimeout(120_000);

    beforeAll(() => {
        // Plugin code can otherwise reach globalThis.process. Live tests receive
        // no developer or CI environment variables.
        replaceProcessEnvironment({});
    });

    afterAll(() => {
        replaceProcessEnvironment(originalEnvironment);
    });

    it.each(providerCases)(
        "$platform mounts, searches, and resolves approved standard playback",
        async ({ platform, query, allowedHosts }) => {
            const descriptor = COMMUNITY_MANAGED_PLUGINS.find(
                item => item.platform === platform,
            );
            if (!descriptor) {
                throw new Error(`${platform}: descriptor is missing`);
            }

            const plugin = mountPlugin(descriptor.source);
            if (plugin.platform !== platform ||
                typeof plugin.search !== "function" ||
                typeof plugin.getMediaSource !== "function" ||
                !plugin.supportedSearchType?.includes("music")) {
                throw new Error(`${platform}: mounted plugin contract is invalid`);
            }

            const searchResult = await callProvider(
                platform,
                "search",
                () => plugin.search!(query, 1, "music"),
            );
            const items = rows(searchResult);
            if (items.length === 0) {
                reportNoLiveData(platform, "search");
                return;
            }
            if (!isValidSearchItem(items[0])) {
                throw new Error(`${platform}: search returned an invalid item`);
            }

            const playbackFailureKinds: string[] = [];
            for (const item of items.slice(0, 10)) {
                let media: unknown;
                try {
                    media = await plugin.getMediaSource!(item, "standard");
                } catch (error) {
                    playbackFailureKinds.push(safeFailureKind(error));
                    continue;
                }
                const mediaUrl = media && typeof media === "object"
                    ? (media as { url?: unknown }).url
                    : undefined;
                if (mediaUrl === undefined || mediaUrl === null || mediaUrl === "") {
                    continue;
                }
                if (!isApprovedMediaUrl(mediaUrl, allowedHosts)) {
                    throw new Error(
                        `${platform}: playback returned a disallowed media URL`,
                    );
                }
                return;
            }

            if (playbackFailureKinds.length === Math.min(items.length, 10)) {
                throw new Error(
                    `${platform}: standard playback failed (` +
                    `${[...new Set(playbackFailureKinds)].join(", ")})`,
                );
            }

            reportNoLiveData(platform, "playback");
        },
    );
});
