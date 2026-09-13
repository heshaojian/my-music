export const UDIO_PLUGIN_SOURCE = String.raw`"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");

const PAGE_SIZE = 30;
const SEARCH_URL = "https://www.udio.com/api/songs/search";
const MEDIA_HOST = "storage.googleapis.com";
const LEGACY_MEDIA_PATH_PREFIX = "/udio-artifacts-public/";
const CURRENT_MEDIA_PATH_PATTERN = /^\/udio-artifacts-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/samples\//i;
const HEADERS = Object.freeze({
    "user-agent": "MyMusic/0.6.2 (Udio client)",
    host: "www.udio.com",
});

function isSafeMediaUrl(value) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
        return false;
    }
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" &&
            parsed.username === "" &&
            parsed.password === "" &&
            parsed.hostname === MEDIA_HOST &&
            (parsed.pathname.startsWith(LEGACY_MEDIA_PATH_PREFIX) ||
                CURRENT_MEDIA_PATH_PATTERN.test(parsed.pathname));
    }
    catch (_error) {
        return false;
    }
}

function textOrUndefined(value) {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : undefined;
}

function formatMusicItem(row) {
    if (!row || typeof row !== "object" || !row.id || !textOrUndefined(row.title)) {
        return null;
    }
    const url = isSafeMediaUrl(row.song_path) ? row.song_path : undefined;
    if (!url) {
        return null;
    }
    return {
        id: String(row.id),
        artist: textOrUndefined(row.artist),
        title: row.title.trim(),
        createdAt: row.created_at,
        artwork: textOrUndefined(row.image_path),
        url,
        duration: typeof row.duration === "number" ? row.duration : undefined,
        mv: textOrUndefined(row.video_path),
        rawLrc: textOrUndefined(row.lyrics),
    };
}

function mapRows(rows) {
    return Array.isArray(rows)
        ? rows.map(formatMusicItem).filter(Boolean)
        : [];
}

async function requestSearch(searchTerm, pageParam, maxAgeInHours) {
    const searchQuery = {
        sort: "plays",
        searchTerm,
        ...(maxAgeInHours ? { maxAgeInHours } : {}),
    };
    const response = await axios_1.default({
        method: "post",
        url: SEARCH_URL,
        headers: HEADERS,
        data: JSON.stringify({
            searchQuery,
            pageParam,
            pageSize: PAGE_SIZE,
            trendingId: "93de406e-bdc1-40a6-befd-90637a362158",
        }),
    });
    const rows = response && response.data && response.data.data;
    return Array.isArray(rows) ? [...rows] : [];
}

async function search(query, page, type) {
    if (type !== "music") {
        return { isEnd: true, data: [] };
    }
    const rows = await requestSearch(query, Math.max(0, page - 1));
    return {
        isEnd: rows.length < PAGE_SIZE,
        data: mapRows(rows),
    };
}

function getTopLists() {
    return [{
        title: "Trending",
        data: [
            { id: "today", maxAgeInHours: 24, title: "Today" },
            { id: "week", maxAgeInHours: 168, title: "This Week" },
            { id: "month", maxAgeInHours: 720, title: "This Month" },
            { id: "all", title: "All Time" },
        ],
    }];
}

async function getTopListDetail(topListItem) {
    const rows = await requestSearch("", 0, topListItem && topListItem.maxAgeInHours);
    return {
        isEnd: true,
        musicList: mapRows(rows),
    };
}

async function getMediaSource(musicItem) {
    const url = musicItem && musicItem.url;
    return isSafeMediaUrl(url)
        ? { url, quality: "standard" }
        : null;
}

async function getLyric(musicItem) {
    const rawLrc = textOrUndefined(musicItem && musicItem.rawLrc);
    return rawLrc ? { rawLrc } : null;
}

module.exports = {
    platform: "udio",
    author: "猫头猫",
    version: "0.0.2-mymusic.1",
    supportedSearchType: ["music"],
    cacheControl: "no-store",
    search,
    getMediaSource,
    getTopListDetail,
    getTopLists,
    getLyric,
};
`;

export const UDIO_MANAGED_PLUGIN = {
    platform: "udio",
    version: "0.0.2-mymusic.1",
    source: UDIO_PLUGIN_SOURCE,
} as const;

export default UDIO_MANAGED_PLUGIN;
