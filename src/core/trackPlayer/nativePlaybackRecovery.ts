import {
    CrossProviderPlaybackFallbackResult,
    resolveCrossProviderPlaybackFallback,
} from "./crossProviderPlaybackFallback";

type ResolveFallback = typeof resolveCrossProviderPlaybackFallback;
type FallbackOptions = Parameters<ResolveFallback>[0];

interface NativePlaybackRecoveryOptions {
    musicItem: IMusic.IMusicItem;
    qualityOrder: IMusic.IQualityKey[];
    excludedProviderNames?: readonly string[];
    isStillCurrent(): boolean;
}

interface NativePlaybackRecoveryDependencies {
    getPluginByName: FallbackOptions["getPluginByName"];
    getPosition(): Promise<number>;
    replaceSource(
        source: IPlugin.IMediaSourceResult,
        originalMusicItem: IMusic.IMusicItem,
        position: number,
    ): Promise<void>;
    resolveFallback?: ResolveFallback;
}

export function canAttemptNativePlaybackRecovery(
    sourceResolutionId: number,
    attemptedResolutionId: number,
) {
    return sourceResolutionId > 0 && sourceResolutionId !== attemptedResolutionId;
}

async function getSafePosition(
    getPosition: NativePlaybackRecoveryDependencies["getPosition"],
) {
    try {
        const position = await getPosition();
        return Number.isFinite(position) && position > 0 ? position : 0;
    } catch {
        return 0;
    }
}

export async function recoverNativePlaybackFailure(
    options: NativePlaybackRecoveryOptions,
    dependencies: NativePlaybackRecoveryDependencies,
): Promise<boolean> {
    const position = await getSafePosition(dependencies.getPosition);
    const resolveFallback = dependencies.resolveFallback ??
        resolveCrossProviderPlaybackFallback;

    let fallback: CrossProviderPlaybackFallbackResult | null;
    try {
        fallback = await resolveFallback({
            musicItem: options.musicItem,
            qualityOrder: options.qualityOrder,
            getPluginByName: dependencies.getPluginByName,
            shouldAbort: () => !options.isStillCurrent(),
            ...(options.excludedProviderNames?.length
                ? { excludedProviderNames: options.excludedProviderNames }
                : {}),
        });
    } catch {
        return false;
    }

    if (!fallback || !options.isStillCurrent()) {
        return false;
    }

    try {
        await dependencies.replaceSource(
            fallback.source,
            options.musicItem,
            position,
        );
        return true;
    } catch {
        return false;
    }
}
