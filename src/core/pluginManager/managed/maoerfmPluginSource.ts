export const MAOERFM_PLUGIN_SOURCE = String.raw`"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");

const PAGE_SIZE = 30;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BASE_HEADERS = Object.freeze({
    "user-agent": UA,
    accept: "application/json,text/plain,*/*",
});

function validMusicFilter(item) {
    return String(item && item.pay_type) === "0";
}

function formatMusicItem(item) {
    return {
        id: item.id,
        artwork: item.front_cover,
        title: item.soundstr,
        artist: item.username,
        user_id: item.user_id,
        duration: +(item.duration || 0),
    };
}

function formatAlbumItem(item) {
    return {
        id: item.id,
        artist: item.author,
        title: item.name,
        artwork: item.cover,
        description: item.abstract,
    };
}

function isHttpsUrl(value) {
    if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
        return false;
    }
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" &&
            !parsed.username &&
            !parsed.password &&
            (parsed.hostname === "missevan.com" || parsed.hostname.endsWith(".missevan.com"));
    }
    catch (_error) {
        return false;
    }
}

function isHlsUrl(value) {
    try {
        return new URL(value).pathname.toLowerCase().endsWith(".m3u8");
    }
    catch (_error) {
        return false;
    }
}

function isProtectedHlsPlaylist(text) {
    return typeof text === "string" &&
        /#EXT-X-KEY/i.test(text) &&
        /(METHOD=SAMPLE-AES|KEYFORMAT=|skd:\/\/|urn:uuid:edef8ba9)/i.test(text);
}

async function isPlayableMediaUrl(url) {
    if (!isHttpsUrl(url)) {
        return false;
    }
    if (!isHlsUrl(url)) {
        return true;
    }
    const playlist = (await axios_1.default.get(url, {
        headers: BASE_HEADERS,
        responseType: "text",
        transformResponse: [data => data],
    })).data;
    return !isProtectedHlsPlaylist(playlist);
}

async function searchMusic(query, page) {
    const res = (await axios_1.default.get("https://www.missevan.com/sound/getsearch", {
        params: { s: query, p: page, type: 3, page_size: PAGE_SIZE },
        headers: {
            ...BASE_HEADERS,
            referer: "https://www.missevan.com/sound/search",
        },
    })).data.info || {};
    const rows = Array.isArray(res.Datas) ? res.Datas : [];
    const pagination = res.pagination || {};
    return {
        isEnd: Number(pagination.p || page) >= Number(pagination.maxpage || page),
        data: rows.filter(validMusicFilter).map(formatMusicItem),
    };
}

async function searchAlbum(query, page) {
    const res = (await axios_1.default.get("https://www.missevan.com/dramaapi/search", {
        headers: {
            ...BASE_HEADERS,
            referer: "https://www.missevan.com/sound/search",
        },
        params: { s: query, page },
    })).data.info || {};
    const rows = Array.isArray(res.Datas) ? res.Datas : [];
    const pagination = res.pagination || {};
    return {
        isEnd: Number(pagination.p || page) >= Number(pagination.maxpage || page),
        data: rows.filter(validMusicFilter).map(formatAlbumItem),
    };
}

async function getMediaSource(musicItem, quality) {
    if (quality === "high" || quality === "super") {
        return null;
    }
    const id = musicItem && musicItem.id;
    const referer = "https://www.missevan.com/sound/player?id=" + encodeURIComponent(String(id || ""));
    const sound = ((await axios_1.default.get("https://www.missevan.com/sound/getsound", {
        headers: { ...BASE_HEADERS, referer },
        params: { soundid: id },
    })).data.info || {}).sound || {};
    const candidates = quality === "low"
        ? [sound.soundurl_128, sound.soundurl]
        : [sound.soundurl, sound.soundurl_128];
    for (const url of candidates) {
        if (await isPlayableMediaUrl(url)) {
            return {
                url,
                headers: { "user-agent": UA, referer },
            };
        }
    }
    return null;
}

async function getAlbumInfo(albumItem) {
    const res = (await axios_1.default.get("https://www.missevan.com/dramaapi/getdrama", {
        headers: {
            ...BASE_HEADERS,
            referer: "https://www.missevan.com/mdrama/" + encodeURIComponent(String(albumItem.id)),
        },
        params: { drama_id: albumItem.id },
    })).data || {};
    const episodes = res.info && res.info.episodes && Array.isArray(res.info.episodes.episode)
        ? res.info.episodes.episode
        : [];
    return {
        musicList: episodes.filter(validMusicFilter).map(item => ({
            ...formatMusicItem(item),
            artwork: albumItem.artwork,
        })),
    };
}

module.exports = {
    platform: "猫耳FM",
    author: "猫头猫",
    version: "0.1.5-mymusic.1",
    appVersion: ">=0.0.0",
    cacheControl: "no-store",
    supportedSearchType: ["music", "album"],
    async search(query, page, type) {
        if (type === "music") {
            return searchMusic(query, page);
        }
        if (type === "album") {
            return searchAlbum(query, page);
        }
        return { isEnd: true, data: [] };
    },
    getMediaSource,
    getAlbumInfo,
};
`;

export const MAOERFM_MANAGED_PLUGIN = {
    platform: "猫耳FM",
    version: "0.1.5-mymusic.1",
    source: MAOERFM_PLUGIN_SOURCE,
} as const;

export default MAOERFM_MANAGED_PLUGIN;
