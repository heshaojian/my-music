export const YINYUETAI_PLUGIN_SOURCE = String.raw`"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const CryptoJs = require("crypto-js");

const PAGE_SIZE = 20;
const API_BASE = "https://video-api.yinyuetai.com";
// Public compatibility material embedded in Yinyuetai's current web client.
const WEB_SIGNATURE_SALT = "91fd6ee712437d42eeccdf545133039888d1cc77";
const WEB_CLIENT_VERSION = "1.0.0;11;101";
const DEVICE_ID = Array.from({ length: 21 }, () =>
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_"[
        Math.floor(Math.random() * 64)
    ]).join("");
let mediaUrlsById = new Map();
let channelsPromise;
let searchCache = { query: undefined, items: [] };

function formatMusicItem(item) {
    return {
        id: item.id,
        title: item.title,
        artist: item.allArtistNames ||
            (Array.isArray(item.artists) ? item.artists.map(artist => artist.name).join(", ") : undefined) ||
            (item.user && item.user.niceName),
        artwork: item.headImg,
        duration: item.fullClip && item.fullClip.duration,
    };
}

function isHttpsUrl(value) {
    if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
        return false;
    }
    try {
        const parsed = new URL(value);
        if (parsed.hostname === "cloud-cdn.yinyuetai.com") {
            return false;
        }
        return parsed.protocol === "https:" &&
            !parsed.username &&
            !parsed.password &&
            (parsed.hostname === "yinyuetai.com" || parsed.hostname.endsWith(".yinyuetai.com"));
    }
    catch (_error) {
        return false;
    }
}

function requestHeaders(params) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams = { st: timestamp, ...(params || {}) };
    const signingInput = Object.keys(signedParams)
        .sort()
        .map(key => key + (signedParams[key] === null ? "" : String(signedParams[key])))
        .join("");
    return {
        wua: "YYT/1.0.0 (WEB;web;11;zh-CN;" + DEVICE_ID + ")",
        vi: WEB_CLIENT_VERSION,
        st: String(timestamp),
        pp: CryptoJs.SHA1(signingInput + WEB_SIGNATURE_SALT).toString(),
    };
}

async function apiGet(path, params) {
    const response = await axios_1.default.get(API_BASE + path, {
        params: params || {},
        headers: requestHeaders(params),
        timeout: 10000,
    });
    const body = response && response.data ? response.data : {};
    return body.code === 0 ? body.data : null;
}

async function getChannels() {
    if (!channelsPromise) {
        channelsPromise = apiGet("/video/explore/channels", {})
            .then(data => Array.isArray(data) ? data : [])
            .catch(error => {
                channelsPromise = undefined;
                throw error;
            });
    }
    return channelsPromise;
}

async function getChannelVideos(channelId, page, size = PAGE_SIZE) {
    const data = await apiGet("/video/explore/channelVideos", {
        channelId,
        detailType: 2,
        size,
        offset: Math.max(0, page - 1) * size,
    });
    return Array.isArray(data) ? data : [];
}

function sanitizeItems(items, resetMediaUrls) {
    const nextMediaUrlsById = resetMediaUrls
        ? new Map()
        : new Map(mediaUrlsById);
    const sanitizedItems = items.map(item => {
        const id = item && item.id;
        const urls = item && item.fullClip && Array.isArray(item.fullClip.urls)
            ? item.fullClip.urls
                .filter(entry => entry && isHttpsUrl(entry.url))
                .map(entry => ({ streamType: entry.streamType, url: entry.url }))
            : [];
        if (id === undefined || id === null) {
            return null;
        }
        nextMediaUrlsById.delete(String(id));
        if (urls.length > 0) {
            nextMediaUrlsById.set(String(id), urls);
        }
        return formatMusicItem(item || {});
    }).filter(Boolean);
    mediaUrlsById = nextMediaUrlsById;
    return sanitizedItems;
}

function matchesQuery(item, normalizedQuery) {
    if (!normalizedQuery) {
        return true;
    }
    return [item.title, item.artist]
        .filter(value => typeof value === "string")
        .some(value => value.toLocaleLowerCase().includes(normalizedQuery));
}

async function searchMusic(query, page) {
    const normalizedQuery = String(query || "").trim().toLocaleLowerCase();
    if (page === 1 || searchCache.query !== normalizedQuery) {
        const channels = await getChannels();
        const results = await Promise.allSettled(channels.map(channel =>
            getChannelVideos(channel.id, 1, 100)));
        const rows = results.flatMap(result =>
            result.status === "fulfilled" ? result.value : []);
        const uniqueRows = Array.from(new Map(rows
            .filter(row => row && row.id !== undefined && row.id !== null)
            .map(row => [String(row.id), row])).values());
        const items = sanitizeItems(uniqueRows, true)
            .filter(item => matchesQuery(item, normalizedQuery));
        searchCache = { query: normalizedQuery, items };
    }
    const start = Math.max(0, page - 1) * PAGE_SIZE;
    const data = searchCache.items.slice(start, start + PAGE_SIZE);
    return {
        isEnd: start + PAGE_SIZE >= searchCache.items.length,
        data,
    };
}

function selectUrl(musicItem, quality) {
    const id = musicItem && musicItem.id;
    const urls = id === undefined || id === null
        ? []
        : mediaUrlsById.get(String(id)) || [];
    const preferredType = quality === "high" ? 1 : 5;
    const preferred = urls.find(item => item && item.streamType === preferredType && isHttpsUrl(item.url));
    const fallback = urls.find(item => item && isHttpsUrl(item.url));
    return (preferred || fallback || {}).url;
}

module.exports = {
    platform: "音悦台",
    author: "猫头猫",
    version: "0.0.3-mymusic.1",
    supportedSearchType: ["music"],
    cacheControl: "no-store",
    async search(query, page, type) {
        if (type === "music") {
            return searchMusic(query, page);
        }
        return { isEnd: true, data: [] };
    },
    async getMediaSource(musicItem, quality) {
        const url = selectUrl(musicItem, quality);
        return url ? { url } : null;
    },
    async getTopLists() {
        const channels = await getChannels();
        return [{
            title: "Yinyuetai Channels",
            data: channels.map(channel => ({
                id: channel.id,
                title: channel.channelName || channel.displayName || String(channel.id),
            })),
        }];
    },
    async getTopListDetail(topListItem, page = 1) {
        const rows = await getChannelVideos(topListItem.id, page, PAGE_SIZE);
        return {
            musicList: sanitizeItems(rows, page === 1),
            isEnd: rows.length < PAGE_SIZE,
        };
    },
};
`;

export const YINYUETAI_MANAGED_PLUGIN = {
    platform: "音悦台",
    version: "0.0.3-mymusic.1",
    source: YINYUETAI_PLUGIN_SOURCE,
} as const;

export default YINYUETAI_MANAGED_PLUGIN;
