export const KUAISHOU_PLUGIN_SOURCE = String.raw`"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
let cookieHeader;
let mediaUrlById = new Map();
let cursorByQuery = new Map();

function getConfiguredCookie() {
    const userVariables = env && typeof env.getUserVariables === "function"
        ? env.getUserVariables()
        : {};
    const value = userVariables && userVariables.cookie;
    if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > 8192 ||
        value.trim() !== value ||
        /[\u0000-\u001f\u007f]/.test(value)
    ) {
        return "";
    }
    return value;
}

function getSetCookie(headers) {
    if (!headers || typeof headers !== "object") {
        return [];
    }
    const raw = headers["set-cookie"];
    return Array.isArray(raw) ? raw : [];
}

async function getCookieHeader() {
    const configuredCookie = getConfiguredCookie();
    if (configuredCookie) {
        return configuredCookie;
    }
    if (cookieHeader) {
        return cookieHeader;
    }
    try {
        const response = await axios_1.default.get("https://www.kuaishou.com/", {
            headers: { "user-agent": UA },
        });
        const receivedCookies = getSetCookie(response.headers)
            .map(item => String(item).split(";")[0])
            .filter(Boolean);
        const hasCookie = name => receivedCookies.some(item => item.startsWith(name + "="));
        const randomHex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
        cookieHeader = [
            ...receivedCookies,
            ...(!hasCookie("kpf") ? ["kpf=PC_WEB"] : []),
            ...(!hasCookie("kpn") ? ["kpn=KUAISHOU_VISION"] : []),
            ...(!hasCookie("clientid") ? ["clientid=3"] : []),
            ...(!hasCookie("did") ? ["did=web_" + randomHex] : []),
        ].join("; ");
    }
    catch (_error) {
        cookieHeader = "";
    }
    return cookieHeader;
}

function isHttpsUrl(value) {
    if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
        return false;
    }
    try {
        const parsed = new URL(value);
        const allowedHost = ["kwaicdn.com", "yximgs.com", "ksapisrv.com"]
            .some(host => parsed.hostname === host || parsed.hostname.endsWith("." + host));
        return parsed.protocol === "https:" &&
            !parsed.username &&
            !parsed.password &&
            allowedHost;
    }
    catch (_error) {
        return false;
    }
}

function formatMusicItem(item) {
    const photo = item && item.photo ? item.photo : {};
    const author = item && item.author ? item.author : {};
    return {
        id: photo.id,
        title: photo.caption || photo.originCaption || photo.id,
        artist: author.name,
        artwork: photo.coverUrl || photo.photoUrl,
    };
}

function getRepresentations(manifest) {
    const adaptationSet = manifest && Array.isArray(manifest.adaptationSet)
        ? manifest.adaptationSet
        : [];
    const candidates = [];
    for (const set of adaptationSet) {
        const representations = set && Array.isArray(set.representation)
            ? set.representation
            : [];
        candidates.push(...representations);
    }
    return candidates;
}

function getMediaUrlFromManifest(manifest) {
    return getRepresentations(manifest)
        .map(representation => representation && representation.url)
        .find(isHttpsUrl);
}

async function searchMusic(query, page) {
    const cookie = await getCookieHeader();
    const previousCursor = page > 1 ? cursorByQuery.get(query) || "" : "";
    const response = await axios_1.default.post("https://www.kuaishou.com/rest/v/search/feed", {
        keyword: query,
        page: "search",
        webPageArea: "search_video",
        pcursor: previousCursor,
    }, {
        headers: {
            "content-type": "application/json",
            "user-agent": UA,
            host: "www.kuaishou.com",
            origin: "https://www.kuaishou.com",
            referer: "https://www.kuaishou.com/search/video?searchKey=" + encodeURIComponent(query),
            cookie,
        },
        withCredentials: true,
    });
    const responseBody = response && response.data && response.data.data
        ? response.data.data
        : response && response.data
            ? response.data
            : {};
    const result = responseBody && typeof responseBody === "object" ? responseBody : {};
    const feeds = Array.isArray(result.feeds) ? result.feeds : [];
    const nextMediaUrlById = page === 1
        ? new Map()
        : new Map(mediaUrlById);
    const data = feeds.map(feed => {
        const item = formatMusicItem(feed);
        const photo = feed && feed.photo ? feed.photo : {};
        const url = getMediaUrlFromManifest(photo.manifest || photo.manifestH265);
        if (item.id && url) {
            nextMediaUrlById.set(String(item.id), url);
        }
        return item;
    }).filter(item => item && item.id);
    mediaUrlById = nextMediaUrlById;
    cursorByQuery = new Map(cursorByQuery);
    if (typeof result.pcursor === "string" && result.pcursor) {
        cursorByQuery.set(query, result.pcursor);
    }
    else {
        cursorByQuery.delete(query);
    }
    return {
        isEnd: !result.pcursor || result.pcursor === "no_more",
        data,
    };
}

module.exports = {
    platform: "快手",
    version: "0.0.5-mymusic.1",
    author: "猫头猫",
    description: "Public search is currently sign-in gated by Kuaishou. Add a browser Cookie in User Variables to enable signed-in search.",
    userVariables: [{
        key: "cookie",
        name: "Kuaishou browser Cookie",
        type: "password",
        hint: "Optional. Copy the Cookie value from a signed-in kuaishou.com browser session.",
    }],
    cacheControl: "no-store",
    supportedSearchType: ["music"],
    async search(query, page, type) {
        if (type === "music") {
            return searchMusic(query, page);
        }
        return { isEnd: true, data: [] };
    },
    async getMediaSource(musicItem) {
        const id = musicItem && musicItem.id;
        const url = id === undefined || id === null
            ? undefined
            : mediaUrlById.get(String(id));
        return url ? { url } : null;
    },
};
`;

export const KUAISHOU_MANAGED_PLUGIN = {
    platform: "快手",
    version: "0.0.5-mymusic.1",
    source: KUAISHOU_PLUGIN_SOURCE,
} as const;

export default KUAISHOU_MANAGED_PLUGIN;
