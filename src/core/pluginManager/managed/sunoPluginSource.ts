export const SUNO_PLUGIN_SOURCE = String.raw`"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");

const HEADERS = Object.freeze({
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    accept: "application/json,text/plain,*/*",
});

function isPlayableUrl(value, allowedHosts) {
    if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
        return false;
    }
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" &&
            !parsed.username &&
            !parsed.password &&
            allowedHosts.includes(parsed.hostname);
    }
    catch (_error) {
        return false;
    }
}

function decodeFlightChunks(html) {
    if (typeof html !== "string") {
        return "";
    }
    const chunks = [];
    const pattern = /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g;
    let match;
    while ((match = pattern.exec(html))) {
        try {
            chunks.push(JSON.parse(match[1]));
        }
        catch (_error) {
        }
    }
    return chunks.join("");
}

function extractJsonArray(text, marker) {
    const markerIndex = text.indexOf(marker);
    if (markerIndex < 0) {
        return [];
    }
    const start = text.indexOf("[", markerIndex + marker.length);
    if (start < 0) {
        return [];
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
        const character = text[index];
        if (inString) {
            if (escaped) {
                escaped = false;
            }
            else if (character === "\\") {
                escaped = true;
            }
            else if (character === '"') {
                inString = false;
            }
            continue;
        }
        if (character === '"') {
            inString = true;
        }
        else if (character === "[") {
            depth += 1;
        }
        else if (character === "]") {
            depth -= 1;
            if (depth === 0) {
                try {
                    const result = JSON.parse(text.slice(start, index + 1));
                    return Array.isArray(result) ? result : [];
                }
                catch (_error) {
                    return [];
                }
            }
        }
    }
    return [];
}

function getPlaylistClips(html) {
    return extractJsonArray(decodeFlightChunks(html), '"playlist_clips":');
}

function getTopLists() {
    return [
        {
            title: "Trending",
            data: [
                { id: "1190bf92-10dc-4ce5-968a-7a377f37f984", title: "Trending - Day" },
                { id: "08a079b2-a63b-4f9c-9f29-de3c1864ddef", title: "Trending - Week" },
                { id: "845539aa-2a39-4cf5-b4ae-16d3fe159a77", title: "Trending - Month" },
                { id: "6943c7ee-cbc5-4f72-bc4e-f3371a8be9d5", title: "Trending - All Time" },
            ],
        },
        {
            title: "Latest",
            data: [{ id: "cc14084a-2622-4c4b-8258-1f6b4b4f54b3", title: "Latest" }],
        },
    ];
}

function formatClip(row) {
    const clip = row && row.clip ? row.clip : {};
    const mediaUrls = Array.isArray(clip.media_urls) ? [...clip.media_urls] : [];
    const audioUrl = mediaUrls
        .map(item => item && item.url)
        .find(url => isPlayableUrl(url, ["d2lwuy8qc234o3.cloudfront.net"]));
    const videoUrl = isPlayableUrl(clip.video_url, ["cdn1.suno.ai"])
        ? clip.video_url
        : undefined;
    const url = env && env.os === "ios"
        ? videoUrl || audioUrl
        : audioUrl || videoUrl;
    return {
        id: clip.id,
        url,
        artwork: clip.image_large_url || clip.image_url,
        duration: clip.metadata && clip.metadata.duration,
        title: clip.title,
        artist: clip.display_name,
        userId: clip.user_id,
        rawLrc: clip.metadata && clip.metadata.prompt,
    };
}

async function getTopListDetail(topListItem) {
    const html = (await axios_1.default.get(
        "https://suno.com/playlist/" + encodeURIComponent(String(topListItem.id)),
        { headers: HEADERS },
    )).data;
    const rows = getPlaylistClips(html);
    return {
        isEnd: true,
        musicList: rows.map(formatClip).filter(item => item.id && item.url),
    };
}

function getLyric(musicItem) {
    return { rawLrc: musicItem && musicItem.rawLrc };
}

module.exports = {
    platform: "suno",
    version: "0.0.2-mymusic.1",
    cacheControl: "no-store",
    getTopLists,
    getTopListDetail,
    getLyric,
};
`;

export const SUNO_MANAGED_PLUGIN = {
    platform: "suno",
    version: "0.0.2-mymusic.1",
    source: SUNO_PLUGIN_SOURCE,
} as const;

export default SUNO_MANAGED_PLUGIN;
