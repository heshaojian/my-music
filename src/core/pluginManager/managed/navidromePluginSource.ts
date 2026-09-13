export const NAVIDROME_PLUGIN_SOURCE = String.raw`"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const CryptoJs = require("crypto-js");

const pageSize = 25;

function getUserVariables() {
    return env && typeof env.getUserVariables === "function"
        ? env.getUserVariables() || {}
        : {};
}

function getConfig() {
    const userVariables = getUserVariables();
    const url = typeof userVariables.url === "string" ? userVariables.url.trim() : "";
    const username = typeof userVariables.username === "string"
        ? userVariables.username.trim()
        : "";
    const password = typeof userVariables.password === "string"
        ? userVariables.password
        : "";
    if (!url || !username || !password) {
        return null;
    }
    let normalizedUrl;
    try {
        const parsedUrl = new URL(url.includes("://") ? url : "https://" + url);
        if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
            return null;
        }
        normalizedUrl = parsedUrl.toString().replace(/\/+$/, "");
    }
    catch (_error) {
        return null;
    }
    return {
        url: normalizedUrl,
        username,
        password,
    };
}

function emptyPage() {
    return {
        isEnd: true,
        data: [],
    };
}

function tokenParams(config) {
    const salt = Math.random().toString(16).slice(2);
    return {
        u: config.username,
        s: salt,
        t: CryptoJs.MD5(config.password + salt).toString(CryptoJs.enc.Hex),
        c: "MusicFree",
        v: "1.14.1",
        f: "json",
    };
}

async function httpGet(urlPath, params) {
    const config = getConfig();
    if (!config) {
        return null;
    }
    const response = await axios_1.default.get(config.url + "/rest/" + urlPath, {
        params: Object.assign(Object.assign({}, tokenParams(config)), params),
    });
    return response && response.data;
}

function responseBody(data) {
    return data && data["subsonic-response"] ? data["subsonic-response"] : {};
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function copyMusicItem(raw) {
    return Object.assign(Object.assign({}, raw), {
        artwork: raw && raw.coverArt,
    });
}

function copyAlbumItem(raw) {
    return Object.assign(Object.assign({}, raw), {
        artwork: raw && raw.coverArt,
    });
}

async function searchMusic(query, page) {
    const data = await httpGet("search2", {
        query,
        songCount: pageSize,
        songOffset: (page - 1) * pageSize,
    });
    if (!data) {
        return emptyPage();
    }
    const songs = toArray(responseBody(data).searchResult2 &&
        responseBody(data).searchResult2.song);
    return {
        isEnd: songs.length < pageSize,
        data: songs.map(copyMusicItem),
    };
}

async function searchAlbum(query, page) {
    const data = await httpGet("search2", {
        query,
        albumCount: pageSize,
        albumOffset: (page - 1) * pageSize,
    });
    if (!data) {
        return emptyPage();
    }
    const albums = toArray(responseBody(data).searchResult2 &&
        responseBody(data).searchResult2.album);
    return {
        isEnd: albums.length < pageSize,
        data: albums.map(copyAlbumItem),
    };
}

async function getAlbumInfo(albumItem) {
    const data = await httpGet("getAlbum", {
        id: albumItem && albumItem.id,
    });
    if (!data) {
        return {
            isEnd: true,
            musicList: [],
        };
    }
    const songs = toArray(responseBody(data).album && responseBody(data).album.song);
    return {
        isEnd: true,
        musicList: songs.map(copyMusicItem),
    };
}

async function getMediaSource(musicItem) {
    const config = getConfig();
    if (!config || !musicItem || !musicItem.id) {
        return null;
    }
    const urlObj = new URL(config.url + "/rest/stream");
    const params = Object.assign(Object.assign({}, tokenParams(config)), {
        id: musicItem.id,
    });
    Object.keys(params).forEach(key => {
        urlObj.searchParams.append(key, params[key]);
    });
    return {
        url: urlObj.toString(),
    };
}

module.exports = {
    platform: "Navidrome",
    version: "0.0.1-mymusic.1",
    author: "猫头猫",
    appVersion: ">0.1.0-alpha.0",
    cacheControl: "no-store",
    userVariables: [
        {
            key: "url",
            name: "Server URL",
        },
        {
            key: "username",
            name: "Username",
        },
        {
            key: "password",
            name: "Password",
            type: "password",
        },
    ],
    supportedSearchType: ["music", "album"],
    async search(query, page, type) {
        if (type === "music") {
            return searchMusic(query, page);
        }
        if (type === "album") {
            return searchAlbum(query, page);
        }
        return emptyPage();
    },
    getAlbumInfo,
    getMediaSource,
};
`;

export const NAVIDROME_MANAGED_PLUGIN = {
    platform: "Navidrome",
    version: "0.0.1-mymusic.1",
    source: NAVIDROME_PLUGIN_SOURCE,
} as const;

export default NAVIDROME_MANAGED_PLUGIN;
