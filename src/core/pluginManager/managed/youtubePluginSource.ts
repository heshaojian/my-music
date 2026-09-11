export const YOUTUBE_PLUGIN_SOURCE = String.raw`"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");

const NETWORK_TIMEOUT_MS = 10000;
const SESSION_TTL_MS = 15 * 60 * 1000;
const HOMEPAGE_URL = "https://www.youtube.com/";
const SEARCH_URL = "https://www.youtube.com/youtubei/v1/search?prettyPrint=false";
const PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const BROWSER_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const PLAYER_USER_AGENT = "com.google.android.apps.youtube.vr.oculus/1.71.26 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip";
const PLAYER_CLIENT = Object.freeze({
    clientName: "ANDROID_VR",
    clientVersion: "1.71.26",
    deviceMake: "Oculus",
    deviceModel: "Quest 3",
    androidSdkVersion: 32,
    osName: "Android",
    osVersion: "12L",
    hl: "en",
    timeZone: "UTC",
    utcOffsetMinutes: 0,
});
const QUALITY_BITRATES = Object.freeze({
    low: 64000,
    standard: 128000,
    high: 192000,
    super: 320000,
});

function firstRunText(value) {
    const runs = value && Array.isArray(value.runs) ? value.runs : [];
    const first = runs[0];
    return first && typeof first.text === "string" ? first.text : undefined;
}

function formatMusicItem(item) {
    const thumbnails = item && item.thumbnail && Array.isArray(item.thumbnail.thumbnails)
        ? item.thumbnail.thumbnails
        : [];
    return {
        id: item.videoId,
        title: firstRunText(item.title),
        artist: firstRunText(item.ownerText),
        artwork: thumbnails[0] && thumbnails[0].url,
    };
}

let lastQuery;
let musicContinuationToken;

function getSearchContents(response) {
    const primary = response &&
        response.contents &&
        response.contents.twoColumnSearchResultsRenderer &&
        response.contents.twoColumnSearchResultsRenderer.primaryContents &&
        response.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer;
    if (primary && Array.isArray(primary.contents)) {
        return primary.contents;
    }
    const continuation = response &&
        response.onResponseReceivedCommands &&
        Array.isArray(response.onResponseReceivedCommands)
        ? response.onResponseReceivedCommands
        : [];
    for (const command of continuation) {
        const items = command &&
            command.appendContinuationItemsAction &&
            command.appendContinuationItemsAction.continuationItems;
        if (Array.isArray(items)) {
            return items;
        }
    }
    return [];
}

function getContinuationToken(contents) {
    for (const item of contents) {
        const command = item &&
            item.continuationItemRenderer &&
            item.continuationItemRenderer.continuationEndpoint &&
            item.continuationItemRenderer.continuationEndpoint.continuationCommand;
        if (command &&
            command.request === "CONTINUATION_REQUEST_TYPE_SEARCH" &&
            typeof command.token === "string") {
            return command.token;
        }
    }
    return undefined;
}

function getSearchRows(contents) {
    const rows = [];
    for (const item of contents) {
        const sectionRows = item &&
            item.itemSectionRenderer &&
            Array.isArray(item.itemSectionRenderer.contents)
            ? item.itemSectionRenderer.contents
            : [];
        for (const row of sectionRows) {
            if (row && row.videoRenderer && typeof row.videoRenderer.videoId === "string") {
                rows.push(row.videoRenderer);
            }
        }
    }
    return rows;
}

async function searchMusic(query, page) {
    if (query !== lastQuery || page === 1) {
        musicContinuationToken = undefined;
    }
    lastQuery = query;
    const request = {
        context: {
            client: {
                hl: "zh-CN",
                gl: "US",
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
                clientName: "WEB",
                clientVersion: "2.20231121.08.00",
                osName: "Windows",
                osVersion: "10.0",
                platform: "DESKTOP",
            },
            user: { lockedSafetyMode: false },
            request: { useSsl: true, internalExperimentFlags: [] },
        },
        query: musicContinuationToken ? undefined : query,
        continuation: musicContinuationToken || undefined,
    };
    const response = await axios_1.default.post(SEARCH_URL, request, {
        headers: { "Content-Type": "application/json" },
        timeout: NETWORK_TIMEOUT_MS,
        withCredentials: true,
    });
    const contents = getSearchContents(response && response.data);
    musicContinuationToken = getContinuationToken(contents);
    return {
        isEnd: !musicContinuationToken,
        data: getSearchRows(contents).map(formatMusicItem),
    };
}

async function search(query, page, type) {
    if (type === "music") {
        return searchMusic(query, page);
    }
}

function isValidVideoId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value);
}

function extractVisitorData(value) {
    if (typeof value !== "string") {
        return null;
    }
    const match = value.match(/"VISITOR_DATA":"((?:\\.|[^"\\]){1,2048})"/);
    if (!match) {
        return null;
    }
    let decoded;
    try {
        decoded = JSON.parse("\"" + match[1] + "\"");
    }
    catch (_error) {
        return null;
    }
    return typeof decoded === "string" &&
        decoded.length > 0 &&
        decoded.length <= 1024 &&
        /^[A-Za-z0-9._%=-]+$/.test(decoded)
        ? decoded
        : null;
}

let visitorData;
let visitorExpiresAt = 0;
let sessionInitialization;

async function bootstrapSession() {
    const response = await axios_1.default.get(HOMEPAGE_URL, {
        headers: { "user-agent": BROWSER_USER_AGENT },
        timeout: NETWORK_TIMEOUT_MS,
        withCredentials: true,
    });
    return extractVisitorData(response && response.data);
}

function getSession() {
    if (visitorData && Date.now() < visitorExpiresAt) {
        return Promise.resolve(visitorData);
    }
    visitorData = undefined;
    visitorExpiresAt = 0;
    if (!sessionInitialization) {
        sessionInitialization = bootstrapSession()
            .then(value => {
                visitorData = value || undefined;
                visitorExpiresAt = value ? Date.now() + SESSION_TTL_MS : 0;
                return value;
            })
            .finally(() => {
                sessionInitialization = undefined;
            });
    }
    return sessionInitialization;
}

function invalidateSession(value) {
    if (visitorData === value) {
        visitorData = undefined;
        visitorExpiresAt = 0;
    }
}

async function requestPlayer(videoId, visitor) {
    const body = {
        context: {
            client: Object.assign({}, PLAYER_CLIENT),
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
    };
    const response = await axios_1.default.post(PLAYER_URL, body, {
        headers: {
            "Content-Type": "application/json",
            "X-Youtube-Client-Name": "28",
            "X-Youtube-Client-Version": "1.71.26",
            "X-Goog-Visitor-Id": visitor,
            Origin: HOMEPAGE_URL.slice(0, -1),
            "user-agent": PLAYER_USER_AGENT,
        },
        timeout: NETWORK_TIMEOUT_MS,
        withCredentials: true,
    });
    return response && response.data;
}

function isAllowedMediaUrl(value) {
    if (typeof value !== "string" ||
        value.length === 0 ||
        value.trim() !== value ||
        /[\s\x00-\x1F\x7F]/.test(value)) {
        return false;
    }
    try {
        const parsed = new URL(value);
        const hostname = parsed.hostname.toLowerCase();
        return parsed.protocol === "https:" &&
            !parsed.username &&
            !parsed.password &&
            (hostname === "googlevideo.com" || hostname.endsWith(".googlevideo.com"));
    }
    catch (_error) {
        return false;
    }
}

function isAudioOnly(format) {
    return typeof format.mimeType === "string" &&
        format.mimeType.toLowerCase().startsWith("audio/");
}

function isProgressiveWithAudio(format) {
    if (typeof format.mimeType !== "string" ||
        !format.mimeType.toLowerCase().startsWith("video/")) {
        return false;
    }
    const hasAudioMetadata = (typeof format.audioQuality === "string" &&
        /^AUDIO_QUALITY_/.test(format.audioQuality)) ||
        (typeof format.audioSampleRate === "string" &&
            /^\d+$/.test(format.audioSampleRate) &&
            Number(format.audioSampleRate) > 0) ||
        (Number.isFinite(format.audioChannels) && format.audioChannels > 0);
    const codecSection = format.mimeType.match(/codecs="([^"]+)"/i);
    const hasKnownAudioCodec = Boolean(codecSection && codecSection[1]
        .split(",")
        .some(codec => /^(mp4a|opus|vorbis|ac-3|ec-3)(\.|$)/i.test(codec.trim())));
    return hasAudioMetadata || hasKnownAudioCodec;
}

function makeCandidates(values, predicate, offset) {
    const rows = Array.isArray(values) ? [...values] : [];
    return rows
        .map((format, index) => ({ format, index: offset + index }))
        .filter(candidate => candidate.format &&
            typeof candidate.format === "object" &&
            isAllowedMediaUrl(candidate.format.url) &&
            predicate(candidate.format));
}

function selectNearest(candidates, quality) {
    const target = QUALITY_BITRATES[quality] || QUALITY_BITRATES.standard;
    return [...candidates].sort((left, right) => {
        const leftBitrate = Number.isFinite(left.format.bitrate)
            ? Math.max(0, left.format.bitrate)
            : 0;
        const rightBitrate = Number.isFinite(right.format.bitrate)
            ? Math.max(0, right.format.bitrate)
            : 0;
        const distance = Math.abs(leftBitrate - target) - Math.abs(rightBitrate - target);
        return distance || leftBitrate - rightBitrate || left.index - right.index;
    })[0];
}

function selectFormat(response, quality) {
    if (!response ||
        typeof response !== "object" ||
        !response.playabilityStatus ||
        response.playabilityStatus.status !== "OK" ||
        !response.streamingData ||
        typeof response.streamingData !== "object") {
        return null;
    }
    const adaptive = Array.isArray(response.streamingData.adaptiveFormats)
        ? response.streamingData.adaptiveFormats
        : [];
    const formats = Array.isArray(response.streamingData.formats)
        ? response.streamingData.formats
        : [];
    const audioOnly = [
        ...makeCandidates(adaptive, isAudioOnly, 0),
        ...makeCandidates(formats, isAudioOnly, adaptive.length),
    ];
    const progressive = makeCandidates(
        formats,
        isProgressiveWithAudio,
        adaptive.length,
    );
    const candidates = audioOnly.length > 0 ? audioOnly : progressive;
    const selected = selectNearest(candidates, quality);
    return selected ? selected.format : null;
}

function shouldRefreshSession(response) {
    const status = response &&
        response.playabilityStatus &&
        response.playabilityStatus.status;
    if (status === "LOGIN_REQUIRED") {
        return true;
    }
    return status === "OK" && (!response.streamingData ||
        typeof response.streamingData !== "object");
}

function getActualQuality(format) {
    const providerQuality = format && format.audioQuality;
    if (providerQuality === "AUDIO_QUALITY_LOW") {
        return "low";
    }
    if (providerQuality === "AUDIO_QUALITY_MEDIUM") {
        return "standard";
    }
    if (providerQuality === "AUDIO_QUALITY_HIGH") {
        return "high";
    }
    const bitrate = format && format.bitrate;
    if (!Number.isFinite(bitrate) || bitrate <= 0) {
        return undefined;
    }
    const qualities = Object.keys(QUALITY_BITRATES);
    return [...qualities].sort((left, right) => {
        const leftBitrate = QUALITY_BITRATES[left];
        const rightBitrate = QUALITY_BITRATES[right];
        const distance = Math.abs(leftBitrate - bitrate) - Math.abs(rightBitrate - bitrate);
        return distance || leftBitrate - rightBitrate;
    })[0];
}

async function getMediaSource(musicItem, quality) {
    if (!musicItem || !isValidVideoId(musicItem.id)) {
        return null;
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const visitor = await getSession();
        if (!visitor) {
            return null;
        }
        const response = await requestPlayer(musicItem.id, visitor);
        const selected = selectFormat(response, quality);
        if (selected) {
            const source = {
                url: selected.url,
                headers: { "user-agent": PLAYER_USER_AGENT },
            };
            const actualQuality = getActualQuality(selected);
            return actualQuality
                ? Object.assign({}, source, { quality: actualQuality })
                : source;
        }
        if (attempt === 0 && shouldRefreshSession(response)) {
            invalidateSession(visitor);
            continue;
        }
        return null;
    }
    return null;
}

module.exports = {
    platform: "Youtube",
    author: "MyMusic",
    version: "0.0.2-mymusic.1",
    supportedSearchType: ["music"],
    cacheControl: "no-store",
    search,
    getMediaSource,
};
`;

export const YOUTUBE_MANAGED_PLUGIN = {
    platform: "Youtube",
    version: "0.0.2-mymusic.1",
    source: YOUTUBE_PLUGIN_SOURCE,
} as const;

export default YOUTUBE_MANAGED_PLUGIN;
