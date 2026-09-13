export const MAOERFM_PLUGIN_SOURCE = String.raw`"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");

const PAGE_SIZE = 30;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_TAG_GROUPS = 20;
const MAX_TAGS_PER_GROUP = 100;
const MAX_SHEETS_PER_PAGE = 100;
const MAX_TRACKS_PER_SHEET = 500;
const MAX_TEXT_LENGTH = 300;
const DIRECT_AUDIO_EXTENSIONS = Object.freeze([
    ".aac", ".flac", ".m4a", ".mp3", ".mp4", ".ogg", ".opus", ".wav",
]);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BASE_HEADERS = Object.freeze({
    "user-agent": UA,
    accept: "application/json,text/plain,*/*",
});

function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNonNegativeInteger(value) {
    if (typeof value === "string" && !/^\d+$/.test(value)) {
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizePositiveInteger(value) {
    const parsed = normalizeNonNegativeInteger(value);
    return parsed !== null && parsed > 0 ? parsed : null;
}

function normalizePage(value) {
    return normalizePositiveInteger(value) || 1;
}

function normalizeText(value) {
    const normalized = typeof value === "string" ? value.trim() : "";
    return normalized.length > 0 && normalized.length <= MAX_TEXT_LENGTH
        ? normalized
        : undefined;
}

function boundedRequestConfig(config) {
    const controller = new AbortController();
    const adapter = typeof XMLHttpRequest === "function" ? "xhr" : "fetch";
    return {
        ...config,
        adapter,
        signal: controller.signal,
        onDownloadProgress(progress) {
            if (Number(progress && progress.loaded) > MAX_RESPONSE_BYTES) {
                controller.abort();
            }
        },
        timeout: REQUEST_TIMEOUT_MS,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxBodyLength: MAX_RESPONSE_BYTES,
    };
}

function validMusicFilter(item) {
    return isRecord(item) &&
        String(item.pay_type) === "0" &&
        normalizePositiveInteger(item.id) !== null &&
        Boolean(normalizeText(item.soundstr));
}

function formatMusicItem(item) {
    const duration = Number(item.duration);
    return {
        id: item.id,
        artwork: normalizeProviderUrl(item.front_cover),
        title: normalizeText(item.soundstr),
        artist: normalizeText(item.username),
        user_id: item.user_id,
        duration: Number.isFinite(duration) && duration >= 0 ? duration : 0,
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

function isApprovedMaoerHost(hostname) {
    return hostname === "missevan.com" ||
        hostname.endsWith(".missevan.com") ||
        hostname === "maoercdn.com" ||
        hostname.endsWith(".maoercdn.com");
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
            isApprovedMaoerHost(parsed.hostname.toLowerCase());
    }
    catch (_error) {
        return false;
    }
}

function normalizeProviderUrl(value) {
    return isHttpsUrl(value) ? value : undefined;
}

function isDirectAudioUrl(value) {
    try {
        const pathname = new URL(value).pathname.toLowerCase();
        return DIRECT_AUDIO_EXTENSIONS.some(extension => pathname.endsWith(extension));
    }
    catch (_error) {
        return false;
    }
}

async function isPlayableMediaUrl(url) {
    return isHttpsUrl(url) && isDirectAudioUrl(url);
}

function mediaCandidates(sound, quality) {
    if (!isRecord(sound)) {
        return [];
    }
    return quality === "low"
        ? [sound.soundurl_128, sound.soundurl]
        : [sound.soundurl, sound.soundurl_128];
}

async function getAlbumSounds(albumId) {
    const payload = (await axios_1.default.get("https://www.missevan.com/sound/soundalllist", boundedRequestConfig({
        headers: {
            ...BASE_HEADERS,
            referer: "https://m.missevan.com",
        },
        params: { albumid: albumId },
    }))).data;
    return isRecord(payload) && isRecord(payload.info) && Array.isArray(payload.info.sounds)
        ? payload.info.sounds.slice(0, MAX_TRACKS_PER_SHEET)
        : [];
}

async function searchMusic(query, page) {
    const res = (await axios_1.default.get("https://www.missevan.com/sound/getsearch", boundedRequestConfig({
        params: { s: query, p: page, type: 3, page_size: PAGE_SIZE },
        headers: {
            ...BASE_HEADERS,
            referer: "https://www.missevan.com/sound/search",
        },
    }))).data.info || {};
    const rows = Array.isArray(res.Datas) ? res.Datas : [];
    const pagination = res.pagination || {};
    return {
        isEnd: Number(pagination.p || page) >= Number(pagination.maxpage || page),
        data: rows.filter(validMusicFilter).map(formatMusicItem),
    };
}

async function searchAlbum(query, page) {
    const res = (await axios_1.default.get("https://www.missevan.com/dramaapi/search", boundedRequestConfig({
        headers: {
            ...BASE_HEADERS,
            referer: "https://www.missevan.com/sound/search",
        },
        params: { s: query, page },
    }))).data.info || {};
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
    const albumId = normalizePositiveInteger(musicItem && musicItem._maoerAlbumId);
    if (albumId !== null) {
        const albumSounds = await getAlbumSounds(albumId);
        const albumSound = albumSounds.find(item =>
            isRecord(item) && String(item.id) === String(id),
        );
        for (const url of mediaCandidates(albumSound, quality)) {
            if (await isPlayableMediaUrl(url)) {
                return {
                    url,
                    headers: { "user-agent": UA, referer: "https://m.missevan.com" },
                };
            }
        }
    }
    const sound = ((await axios_1.default.get("https://www.missevan.com/sound/getsound", boundedRequestConfig({
        headers: { ...BASE_HEADERS, referer },
        params: { soundid: id },
    }))).data.info || {}).sound || {};
    for (const url of mediaCandidates(sound, quality)) {
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
    const res = (await axios_1.default.get("https://www.missevan.com/dramaapi/getdrama", boundedRequestConfig({
        headers: {
            ...BASE_HEADERS,
            referer: "https://www.missevan.com/mdrama/" + encodeURIComponent(String(albumItem.id)),
        },
        params: { drama_id: albumItem.id },
    }))).data || {};
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

async function getRecommendSheetTags() {
    const payload = (await axios_1.default.get("https://www.missevan.com/malbum/recommand", boundedRequestConfig({
        headers: {
            ...BASE_HEADERS,
            referer: "https://www.missevan.com",
        },
    }))).data;
    const info = isRecord(payload) && isRecord(payload.info) ? payload.info : {};
    const data = Object.entries(info).slice(0, MAX_TAG_GROUPS).flatMap(([title, rows]) => {
        if (!Array.isArray(rows) || !normalizeText(title)) {
            return [];
        }
        const tags = rows.slice(0, MAX_TAGS_PER_GROUP).flatMap(row => {
            if (!Array.isArray(row) || row.length < 2) {
                return [];
            }
            const id = normalizeNonNegativeInteger(row[0]);
            const tagTitle = normalizeText(row[1]);
            return id === null || !tagTitle ? [] : [{ id, title: tagTitle }];
        });
        return tags.length > 0 ? [{ title: title.trim(), data: tags }] : [];
    });
    return { data };
}

async function getRecommendSheetsByTag(tag, page) {
    const tagId = normalizeNonNegativeInteger(tag && tag.id);
    const requestPage = normalizePage(page);
    const payload = (await axios_1.default.get("https://www.missevan.com/explore/tagalbum", boundedRequestConfig({
        headers: {
            ...BASE_HEADERS,
            referer: "https://m.missevan.com",
        },
        params: {
            order: 0,
            tid: tagId === null ? 0 : tagId,
            p: requestPage,
        },
    }))).data;
    const albums = isRecord(payload) && Array.isArray(payload.albums)
        ? payload.albums.slice(0, MAX_SHEETS_PER_PAGE)
        : [];
    const pagination = isRecord(payload) && isRecord(payload.pagination)
        ? payload.pagination
        : {};
    const currentPage = normalizePositiveInteger(pagination.p);
    const maxPage = normalizePositiveInteger(pagination.maxpage);
    const isEnd = currentPage === null || maxPage === null
        ? true
        : currentPage >= maxPage;
    return {
        isEnd,
        data: albums.flatMap(sheet => {
            if (!isRecord(sheet)) {
                return [];
            }
            const id = normalizePositiveInteger(sheet.id);
            const title = normalizeText(sheet.title);
            if (id === null || !title) {
                return [];
            }
            const worksNum = normalizeNonNegativeInteger(sheet.music_count);
            const createUserId = normalizePositiveInteger(sheet.user_id);
            return [{
                id,
                title,
                artwork: normalizeProviderUrl(sheet.front_cover),
                artist: normalizeText(sheet.username),
                ...(worksNum === null ? {} : { worksNum }),
                ...(createUserId === null ? {} : { createUserId }),
            }];
        }),
    };
}

async function getMusicSheetInfo(sheet) {
    const albumId = normalizePositiveInteger(sheet && sheet.id);
    if (albumId === null) {
        return { isEnd: true, musicList: [] };
    }
    const sounds = await getAlbumSounds(albumId);
    return {
        isEnd: true,
        musicList: sounds.filter(validMusicFilter).map(item => ({
            ...formatMusicItem(item),
            _maoerAlbumId: albumId,
        })),
    };
}

module.exports = {
    platform: "猫耳FM",
    author: "猫头猫",
    version: "0.1.6-mymusic.1",
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
    getRecommendSheetTags,
    getRecommendSheetsByTag,
    getMusicSheetInfo,
};
`;

export const MAOERFM_MANAGED_PLUGIN = {
    platform: "猫耳FM",
    version: "0.1.6-mymusic.1",
    source: MAOERFM_PLUGIN_SOURCE,
} as const;

export default MAOERFM_MANAGED_PLUGIN;
