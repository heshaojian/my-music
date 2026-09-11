const BILIBILI_PLATFORM = "bilibili";

interface URLValue {
    protocol: string;
    username: string;
    password: string;
}

type URLConstructor = new (url: string) => URLValue;
type QualityResolver = (
    quality: IMusic.IQualityKey,
) => Promise<IPlugin.IMediaSourceResult | null | undefined>;

function copyValidBilibiliSource(
    source: IPlugin.IMediaSourceResult | null | undefined,
    quality: IMusic.IQualityKey,
    URLType: URLConstructor,
): IPlugin.IMediaSourceResult | null {
    if (
        typeof source?.url !== "string" ||
        source.url === "" ||
        source.url.trim() !== source.url
    ) {
        return null;
    }

    try {
        const parsedUrl = new URLType(source.url);
        if (
            parsedUrl.protocol !== "https:" ||
            parsedUrl.username !== "" ||
            parsedUrl.password !== ""
        ) {
            return null;
        }
    } catch {
        return null;
    }

    return {
        ...source,
        headers: source.headers ? { ...source.headers } : undefined,
        quality,
    };
}

export function shouldPersistProviderMediaSource(platform: string): boolean {
    return platform !== BILIBILI_PLATFORM;
}

export function filterProviderMediaSourceCache<T>(
    platform: string,
    cachedSource: T | null,
    removeCachedSource: () => void,
): T | null {
    if (platform !== BILIBILI_PLATFORM) {
        return cachedSource;
    }

    if (cachedSource) {
        removeCachedSource();
    }
    return null;
}

export async function resolveWithBilibiliQualityFallback(
    platform: string,
    requestedQuality: IMusic.IQualityKey,
    resolver: QualityResolver,
    URLType: URLConstructor = URL,
): Promise<IPlugin.IMediaSourceResult | null | undefined> {
    if (
        platform !== BILIBILI_PLATFORM ||
        requestedQuality !== "super"
    ) {
        return resolver(requestedQuality);
    }

    try {
        const requestedSource = await resolver(requestedQuality);
        const validRequestedSource = copyValidBilibiliSource(
            requestedSource,
            requestedQuality,
            URLType,
        );
        if (validRequestedSource) {
            return validRequestedSource;
        }
    } catch {
        // A missing fourth Bilibili audio entry is handled by the fallback.
    }

    try {
        return copyValidBilibiliSource(
            await resolver("high"),
            "high",
            URLType,
        );
    } catch {
        return null;
    }
}
