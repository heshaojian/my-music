export const GECIWANG_PLUGIN_SOURCE = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const cheerio_1 = require("cheerio");
const BASE_URL = "https://zh.followlyrics.com";
const SEARCH_URL = BASE_URL + "/search";
const REQUEST_CONFIG = Object.freeze({
    headers: Object.freeze({ "User-Agent": "MyMusic/0.6.2 (lyrics client)" }),
});
function textOrUndefined(value) {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : undefined;
}
function safeFollowLyricsUrl(value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        return null;
    }
    try {
        const url = new URL(value.trim(), BASE_URL);
        if (url.protocol !== "https:" ||
            url.hostname !== "zh.followlyrics.com" ||
            url.username ||
            url.password) {
            return null;
        }
        url.hash = "";
        return url.toString();
    }
    catch (_error) {
        return null;
    }
}
function formatSearchRow($, row) {
    const tds = $(row).children();
    const title = textOrUndefined($(tds.get(0)).text());
    const artist = textOrUndefined($(tds.get(1)).text());
    const album = textOrUndefined($(tds.get(2)).text());
    const id = safeFollowLyricsUrl($(tds.get(3)).children("a").attr("href"));
    return title && id
        ? {
            title,
            artist,
            album,
            id,
        }
        : null;
}
async function search(query, page, type) {
    if (type !== "lyric") {
        return {
            isEnd: true,
            data: [],
        };
    }
    const result = (await axios_1.default.get(SEARCH_URL, Object.assign(Object.assign({}, REQUEST_CONFIG), {
        params: {
            name: query,
            type: "song",
        },
    }))).data;
    const $ = (0, cheerio_1.load)(result);
    const data = $(".table.table-striped > tbody")
        .children("tr")
        .map((index, row) => formatSearchRow($, row))
        .toArray()
        .filter(Boolean);
    return {
        isEnd: true,
        data,
    };
}
async function getLyric(musicItem) {
    const url = safeFollowLyricsUrl(musicItem && musicItem.id);
    if (!url) {
        return null;
    }
    const res = (await axios_1.default.get(url, REQUEST_CONFIG)).data;
    const $ = (0, cheerio_1.load)(res);
    const rawLrc = $("div#lyrics").text().replace(/\\n/g, "");
    return {
        rawLrc,
    };
}
module.exports = {
    platform: "歌词网",
    version: "0.0.1-mymusic.1",
    cacheControl: "no-store",
    supportedSearchType: ["lyric"],
    search,
    getLyric,
};
`;

export const GECIWANG_MANAGED_PLUGIN = {
    platform: "歌词网",
    version: "0.0.1-mymusic.1",
    source: GECIWANG_PLUGIN_SOURCE,
} as const;

export default GECIWANG_MANAGED_PLUGIN;
