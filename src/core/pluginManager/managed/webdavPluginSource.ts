export const WEBDAV_PLUGIN_SOURCE = String.raw`"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const webdav_1 = require("webdav");

let cachedData = {};
const AUDIO_EXTENSION = /\.(mp3|m4a|aac|flac|wav|ogg|opus|alac)$/i;

function getUserVariables() {
    return env && typeof env.getUserVariables === "function"
        ? env.getUserVariables() || {}
        : {};
}

function normalizeSearchPaths(searchPath) {
    if (typeof searchPath !== "string") {
        return ["/"];
    }
    const paths = searchPath
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
    return paths.length ? paths : ["/"];
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
        searchPathList: normalizeSearchPaths(userVariables.searchPath),
        searchPath: typeof userVariables.searchPath === "string"
            ? userVariables.searchPath
            : "",
    };
}

function hasSameConfig(config) {
    return cachedData.url === config.url &&
        cachedData.username === config.username &&
        cachedData.password === config.password &&
        cachedData.searchPath === config.searchPath;
}

function resetCache(config) {
    cachedData = {
        url: config.url,
        username: config.username,
        password: config.password,
        searchPath: config.searchPath,
        searchPathList: [...config.searchPathList],
        cacheFileList: null,
    };
}

function getClient() {
    const config = getConfig();
    if (!config) {
        return null;
    }
    if (!hasSameConfig(config)) {
        resetCache(config);
    }
    return webdav_1.createClient(config.url, {
        authType: webdav_1.AuthType.Password,
        username: config.username,
        password: config.password,
    });
}

function isAudioFile(item) {
    if (!item || item.type !== "file") {
        return false;
    }
    if (typeof item.mime === "string" && item.mime.indexOf("audio/") === 0) {
        return true;
    }
    if (item.mime && item.mime !== "application/octet-stream") {
        return false;
    }
    const fileName = typeof item.basename === "string"
        ? item.basename
        : item.filename;
    return typeof fileName === "string" && AUDIO_EXTENSION.test(fileName);
}

function copyFileItem(item) {
    return Object.assign({}, item);
}

function formatMusicItem(item) {
    return {
        title: item.basename,
        id: item.filename,
        artist: "Unknown Artist",
        album: "Unknown Album",
    };
}

async function readAudioFiles(client, searchPathList) {
    let result = [];
    for (const searchPath of searchPathList) {
        try {
            const fileItems = await client.getDirectoryContents(searchPath);
            const audioItems = Array.isArray(fileItems)
                ? fileItems.filter(isAudioFile).map(copyFileItem)
                : [];
            result = [...result, ...audioItems];
        }
        catch (_error) {
        }
    }
    return result;
}

async function getCachedFiles(client) {
    const searchPathList = Array.isArray(cachedData.searchPathList)
        ? [...cachedData.searchPathList]
        : ["/"];
    if (!Array.isArray(cachedData.cacheFileList)) {
        cachedData = Object.assign(Object.assign({}, cachedData), {
            cacheFileList: await readAudioFiles(client, searchPathList),
        });
    }
    return [...cachedData.cacheFileList];
}

async function searchMusic(query) {
    const client = getClient();
    if (!client) {
        return {
            isEnd: true,
            data: [],
        };
    }
    const files = await getCachedFiles(client);
    return {
        isEnd: true,
        data: files
            .filter(item => typeof item.basename === "string" &&
                item.basename.includes(query))
            .map(formatMusicItem),
    };
}

async function getTopLists() {
    const client = getClient();
    if (!client) {
        return [];
    }
    const searchPathList = Array.isArray(cachedData.searchPathList)
        ? [...cachedData.searchPathList]
        : ["/"];
    return [{
        title: "All Songs",
        data: searchPathList.map(item => ({
            title: item,
            id: item,
        })),
    }];
}

async function getTopListDetail(topListItem) {
    const client = getClient();
    if (!client || !topListItem || !topListItem.id) {
        return {
            isEnd: true,
            musicList: [],
        };
    }
    try {
        const fileItems = await client.getDirectoryContents(topListItem.id);
        const musicList = Array.isArray(fileItems)
            ? fileItems.filter(isAudioFile).map(copyFileItem).map(formatMusicItem)
            : [];
        return {
            isEnd: true,
            musicList,
        };
    }
    catch (_error) {
        return {
            isEnd: true,
            musicList: [],
        };
    }
}

async function getMediaSource(musicItem) {
    const client = getClient();
    if (!client || !musicItem || !musicItem.id) {
        return null;
    }
    const url = client.getFileDownloadLink(musicItem.id);
    return typeof url === "string" && url.length > 0
        ? { url }
        : null;
}

module.exports = {
    platform: "WebDAV",
    author: "猫头猫",
    description: "Configure user variables before using this plugin.",
    userVariables: [
        {
            key: "url",
            name: "WebDAV URL",
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
        {
            key: "searchPath",
            name: "Music paths",
            hint: "Comma-separated paths, for example /Music,/Albums",
        },
    ],
    version: "0.0.3-mymusic.1",
    supportedSearchType: ["music"],
    cacheControl: "no-store",
    search(query, page, type) {
        if (type === "music") {
            return searchMusic(query);
        }
        return {
            isEnd: true,
            data: [],
        };
    },
    getTopLists,
    getTopListDetail,
    getMediaSource,
};
`;

export const WEBDAV_MANAGED_PLUGIN = {
    platform: "WebDAV",
    version: "0.0.3-mymusic.1",
    source: WEBDAV_PLUGIN_SOURCE,
} as const;

export default WEBDAV_MANAGED_PLUGIN;
