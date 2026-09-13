const MAOER_FM_PLATFORM = "猫耳FM";
const DIRECT_AUDIO_PATH = /\.(?:m4a|mp3|aac)$/i;

interface URLValue {
    protocol: string;
    username: string;
    password: string;
    pathname: string;
}

type URLConstructor = new (url: string) => URLValue;

type MediaSourceResolver = () => Promise<
    IPlugin.IMediaSourceResult | null | undefined
>;

function hasControlCharacter(value: string) {
    return [...value].some(character => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1f || codePoint === 0x7f;
    });
}

function isLocalNetworkHostname(hostname: string) {
    const normalizedHostname = hostname
        .toLowerCase()
        .replace(/^\[|\]$/g, "");
    if (
        normalizedHostname === "localhost" ||
        normalizedHostname.endsWith(".localhost") ||
        normalizedHostname === "::1" ||
        normalizedHostname.startsWith("fe80:") ||
        normalizedHostname.startsWith("fc") ||
        normalizedHostname.startsWith("fd")
    ) {
        return true;
    }

    const octets = normalizedHostname.split(".").map(Number);
    if (
        octets.length !== 4 ||
        octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)
    ) {
        return false;
    }

    return octets[0] === 0 ||
        octets[0] === 10 ||
        octets[0] === 127 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168) ||
        (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127);
}

function isSafeLegacyMediaUrl(value: string) {
    if (
        value.length === 0 ||
        value.trim() !== value ||
        hasControlCharacter(value)
    ) {
        return false;
    }

    try {
        const parsedUrl = new URL(value);
        return parsedUrl.protocol === "https:" &&
            parsedUrl.username === "" &&
            parsedUrl.password === "" &&
            parsedUrl.hostname.length > 0 &&
            !isLocalNetworkHostname(parsedUrl.hostname);
    } catch {
        return false;
    }
}

export function normalizePluginMediaSource(
    value: unknown,
): IPlugin.IMediaSourceResult | null {
    if (typeof value === "string") {
        return isSafeLegacyMediaUrl(value) ? { url: value } : null;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as IPlugin.IMediaSourceResult;
    }

    return null;
}

export function getPreferredDirectMediaSource(
    musicItem: IMusic.IMusicItemBase,
    URLType: URLConstructor = URL,
): IPlugin.IMediaSourceResult | null {
    if (
        musicItem.platform !== MAOER_FM_PLATFORM ||
        typeof musicItem.url !== "string"
    ) {
        return null;
    }

    try {
        const parsedUrl = new URLType(musicItem.url);
        if (
            parsedUrl.protocol !== "https:" ||
            parsedUrl.username !== "" ||
            parsedUrl.password !== "" ||
            !DIRECT_AUDIO_PATH.test(parsedUrl.pathname)
        ) {
            return null;
        }

        return { url: musicItem.url };
    } catch {
        return null;
    }
}

export async function resolveProviderMediaSource(
    musicItem: IMusic.IMusicItemBase,
    resolver?: MediaSourceResolver,
    URLType?: URLConstructor,
): Promise<IPlugin.IMediaSourceResult | null | undefined> {
    return getPreferredDirectMediaSource(musicItem, URLType) ?? resolver?.();
}
