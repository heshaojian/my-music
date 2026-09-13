export const GECIQIANXUN_PLUGIN_SOURCE = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const SEARCH_URL = "https://lrclib.net/api/search";
const GET_URL = "https://lrclib.net/api/get/";
const REQUEST_CONFIG = Object.freeze({
    headers: Object.freeze({ "User-Agent": "MyMusic/0.6.2 (lyrics client)" }),
});
function textOrUndefined(value) {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : undefined;
}
function lyricsFor(row) {
    return textOrUndefined(row && row.syncedLyrics) ||
        textOrUndefined(row && row.plainLyrics);
}
function isValidRow(row) {
    return Boolean(row) &&
        typeof row === "object" &&
        (typeof row.id === "number" || typeof row.id === "string") &&
        String(row.id).length > 0 &&
        typeof row.name === "string" &&
        row.name.trim().length > 0 &&
        Boolean(lyricsFor(row));
}
function formatLyricItem(row) {
    return {
        id: String(row.id),
        title: row.name,
        artist: textOrUndefined(row.artistName),
        album: textOrUndefined(row.albumName),
        duration: typeof row.duration === "number" ? row.duration : undefined,
        rawLrc: lyricsFor(row),
    };
}
async function search(query, page, type) {
    if (type !== "lyric") {
        return {
            isEnd: true,
            data: [],
        };
    }
    const response = await axios_1.default.get(SEARCH_URL, {
        ...REQUEST_CONFIG,
        params: {
            q: query,
        },
    });
    const rows = Array.isArray(response.data) ? response.data : [];
    return {
        isEnd: true,
        data: rows.filter(isValidRow).map(formatLyricItem),
    };
}
async function getLyric(musicItem) {
    const id = musicItem && musicItem.id;
    if (typeof id !== "string" && typeof id !== "number") {
        return null;
    }
    const response = await axios_1.default.get(
        GET_URL + encodeURIComponent(String(id)),
        REQUEST_CONFIG,
    );
    const rawLrc = lyricsFor(response.data);
    return rawLrc
        ? {
            rawLrc,
        }
        : null;
}
module.exports = {
    platform: "歌词千寻",
    version: "0.0.1-mymusic.1",
    cacheControl: "no-store",
    supportedSearchType: ["lyric"],
    search,
    getLyric,
};
`;

export const GECIQIANXUN_MANAGED_PLUGIN = {
    platform: "歌词千寻",
    version: "0.0.1-mymusic.1",
    source: GECIQIANXUN_PLUGIN_SOURCE,
} as const;

export default GECIQIANXUN_MANAGED_PLUGIN;
