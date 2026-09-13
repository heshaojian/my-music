const FALLBACK_PROVIDERS = ["Youtube", "Audiomack"] as const;
const MAX_SEARCH_RESULTS = 5;
const DEFAULT_DEADLINE_MS = 8000;
const MIN_TITLE_SCORE = 0.82;
const MIN_ARTIST_SCORE = 0.72;
const MIN_COMBINED_SCORE = 0.82;
const TIMED_OUT = Symbol("timed-out");

interface PlaybackFallbackConfig {
    getConfig(key: "basic.tryChangeSourceWhenPlayFail"): boolean | undefined;
    setConfig(key: "basic.tryChangeSourceWhenPlayFail", value: boolean): void;
}

export function ensureCrossProviderPlaybackFallbackDefault(
    config: PlaybackFallbackConfig,
) {
    if (config.getConfig("basic.tryChangeSourceWhenPlayFail") === undefined) {
        config.setConfig("basic.tryChangeSourceWhenPlayFail", true);
    }
}

export function getPlaybackPersistenceTrack<T>(
    resolvedTrack: T,
    originalTrack: T,
    usedCrossProviderFallback: boolean,
) {
    return usedCrossProviderFallback ? originalTrack : resolvedTrack;
}

const VERSION_TOKEN_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
    ["live", /\blive\b/i],
    ["remix", /\b(?:re)?mix(?:ed)?\b/i],
    ["acoustic", /\bacoustic\b/i],
    ["instrumental", /\binstrumental\b/i],
    ["karaoke", /\bkaraoke\b/i],
    ["cover", /\bcover\b/i],
    ["demo", /\bdemo\b/i],
    ["remaster", /\bremaster(?:ed)?\b/i],
    ["radio-edit", /\bradio\s+edit\b/i],
    ["extended", /\bextended(?:\s+(?:mix|version))?\b/i],
    ["sped-up", /\bsped\s*up\b/i],
    ["slowed", /\bslowed\b/i],
    ["reverb", /\breverb(?:ed)?\b/i],
    ["nightcore", /\bnightcore\b/i],
    ["live-zh", /现场|現場/],
    ["remix-zh", /混音/],
    ["acoustic-zh", /不插电|不插電/],
    ["instrumental-zh", /伴奏|纯音乐|純音樂/],
    ["cover-zh", /翻唱/],
    ["remaster-zh", /重制|重製/],
];

interface FallbackPlugin {
    name: string;
    methods: {
        search(
            query: string,
            page: number,
            type: "music",
        ): Promise<{ data?: IMusic.IMusicItem[] }>;
        getMediaSource(
            musicItem: IMusic.IMusicItem,
            quality: IMusic.IQualityKey,
        ): Promise<unknown>;
    };
}

export interface CrossProviderPlaybackFallbackResult {
    matchedItem: IMusic.IMusicItem;
    source: IPlugin.IMediaSourceResult;
}

interface ResolveCrossProviderPlaybackFallbackOptions {
    musicItem: IMusic.IMusicItem;
    qualityOrder: IMusic.IQualityKey[];
    getPluginByName(name: string): FallbackPlugin | undefined;
    shouldAbort?: () => boolean;
    deadlineMs?: number;
}

interface ScoredCandidate {
    item: IMusic.IMusicItem;
    score: number;
    index: number;
}

function normalizeText(value: unknown) {
    return String(value ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function getVersionTokens(title: unknown) {
    const normalizedTitle = normalizeText(title);
    return VERSION_TOKEN_PATTERNS
        .filter(([, pattern]) => pattern.test(normalizedTitle))
        .map(([token]) => token);
}

function stripVersionTokens(title: unknown) {
    return normalizeText(title)
        .split(" ")
        .filter(token => !VERSION_TOKEN_PATTERNS.some(([, pattern]) => pattern.test(token)))
        .join(" ");
}

function normalizeArtist(value: unknown) {
    return normalizeText(value)
        .replace(/vevo$/i, "")
        .replace(/\b(?:official|topic|channel)\b/gi, "")
        .trim()
        .replace(/\s+/g, " ");
}

function haveMatchingVersionTokens(leftTitle: unknown, rightTitle: unknown) {
    const left = getVersionTokens(leftTitle);
    const right = getVersionTokens(rightTitle);
    return left.length === right.length && left.every((token, index) => token === right[index]);
}

function editDistance(left: string, right: string) {
    if (left === right) {
        return 0;
    }
    if (!left.length || !right.length) {
        return Math.max(left.length, right.length);
    }

    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        const current = [leftIndex];
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            current[rightIndex] = Math.min(
                current[rightIndex - 1] + 1,
                previous[rightIndex] + 1,
                previous[rightIndex - 1] +
                    (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
            );
        }
        previous = current;
    }
    return previous[right.length];
}

function similarity(left: string, right: string) {
    if (!left || !right) {
        return left === right ? 1 : 0;
    }
    return 1 - editDistance(left, right) / Math.max(left.length, right.length);
}

function scoreCandidate(
    matchingItem: IMusic.IMusicItem,
    candidate: IMusic.IMusicItem,
    originalTitle = matchingItem.title,
) {
    if (
        !haveMatchingVersionTokens(matchingItem.title, candidate.title) ||
        !haveMatchingVersionTokens(originalTitle, candidate.title)
    ) {
        return null;
    }

    const titleScore = similarity(
        stripVersionTokens(matchingItem.title),
        stripVersionTokens(candidate.title),
    );
    const artistScore = similarity(
        normalizeArtist(matchingItem.artist),
        normalizeArtist(candidate.artist),
    );
    const combinedScore = titleScore * 0.7 + artistScore * 0.3;
    if (
        titleScore < MIN_TITLE_SCORE ||
        artistScore < MIN_ARTIST_SCORE ||
        combinedScore < MIN_COMBINED_SCORE
    ) {
        return null;
    }
    return combinedScore;
}

function hasControlCharacter(value: string) {
    return [...value].some(character => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1f || codePoint === 0x7f;
    });
}

function isPrivateHostname(hostname: string) {
    const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
        normalized === "localhost" ||
        normalized.endsWith(".localhost") ||
        normalized.endsWith(".local") ||
        normalized === "::" ||
        normalized === "::1" ||
        normalized.startsWith("::ffff:") ||
        normalized.startsWith("fe8") ||
        normalized.startsWith("fe9") ||
        normalized.startsWith("fea") ||
        normalized.startsWith("feb") ||
        normalized.startsWith("fc") ||
        normalized.startsWith("fd")
    ) {
        return true;
    }

    const octets = normalized.split(".").map(Number);
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

function normalizeSafeSource(value: unknown): IPlugin.IMediaSourceResult | null {
    const source = typeof value === "string"
        ? { url: value }
        : value && typeof value === "object" && !Array.isArray(value)
            ? value as IPlugin.IMediaSourceResult
            : null;
    if (!source || typeof source.url !== "string") {
        return null;
    }
    const url = source.url;
    if (!url || url.trim() !== url || hasControlCharacter(url)) {
        return null;
    }

    try {
        const parsed = new URL(url);
        if (
            parsed.protocol !== "https:" ||
            parsed.username ||
            parsed.password ||
            !parsed.hostname ||
            isPrivateHostname(parsed.hostname)
        ) {
            return null;
        }
    } catch {
        return null;
    }

    return {
        ...source,
        ...(source.headers ? { headers: { ...source.headers } } : {}),
        url,
    };
}

async function beforeDeadline<T>(promise: Promise<T>, expiresAt: number) {
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
        return TIMED_OUT;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<typeof TIMED_OUT>(resolve => {
                timer = setTimeout(() => resolve(TIMED_OUT), remainingMs);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

export async function resolveCrossProviderPlaybackFallback({
    musicItem,
    qualityOrder,
    getPluginByName,
    shouldAbort = () => false,
    deadlineMs = DEFAULT_DEADLINE_MS,
}: ResolveCrossProviderPlaybackFallbackOptions): Promise<CrossProviderPlaybackFallbackResult | null> {
    const expiresAt = Date.now() + deadlineMs;
    const matchingTitle = typeof musicItem.alias === "string" && musicItem.alias.trim()
        ? musicItem.alias.trim()
        : musicItem.title;
    const matchingMusicItem = {
        ...musicItem,
        title: matchingTitle,
    };
    const query = `${matchingTitle} ${musicItem.artist}`.trim();

    for (const providerName of FALLBACK_PROVIDERS) {
        if (shouldAbort() || Date.now() >= expiresAt) {
            return null;
        }
        if (providerName === musicItem.platform) {
            continue;
        }

        const provider = getPluginByName(providerName);
        if (!provider) {
            continue;
        }

        let result: { data?: IMusic.IMusicItem[] } | typeof TIMED_OUT | null = null;
        try {
            result = await beforeDeadline(provider.methods.search(query, 1, "music"), expiresAt);
        } catch {
            result = null;
        }
        if (result === TIMED_OUT) {
            return null;
        }

        const candidates: ScoredCandidate[] = (result?.data ?? [])
            .slice(0, MAX_SEARCH_RESULTS)
            .map((item, index) => ({
                item,
                index,
                score: scoreCandidate(matchingMusicItem, item, musicItem.title),
            }))
            .filter((item): item is ScoredCandidate => item.score !== null)
            .sort((left, right) => right.score - left.score || left.index - right.index);

        for (const candidate of candidates) {
            for (const quality of qualityOrder) {
                if (shouldAbort() || Date.now() >= expiresAt) {
                    return null;
                }
                let source: unknown;
                try {
                    source = await beforeDeadline(
                        provider.methods.getMediaSource(candidate.item, quality),
                        expiresAt,
                    );
                } catch {
                    source = null;
                }
                if (source === TIMED_OUT) {
                    return null;
                }
                const safeSource = normalizeSafeSource(source);
                if (safeSource) {
                    return {
                        matchedItem: candidate.item,
                        source: {
                            ...safeSource,
                            quality: safeSource.quality ?? quality,
                        },
                    };
                }
            }
        }
    }
    return null;
}
