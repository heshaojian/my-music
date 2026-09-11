const NON_PERSISTENT_MEDIA_SOURCE_PLATFORMS = new Set([
    "bilibili",
    "Audiomack",
    "Youtube",
]);

export function shouldPersistProviderMediaSource(platform: string): boolean {
    return !NON_PERSISTENT_MEDIA_SOURCE_PLATFORMS.has(platform);
}

export function filterProviderMediaSourceCache<T>(
    platform: string,
    cachedSource: T | null,
    removeCachedSource: () => void,
): T | null {
    if (shouldPersistProviderMediaSource(platform)) {
        return cachedSource;
    }

    if (cachedSource) {
        removeCachedSource();
    }
    return null;
}
