import {
    canAttemptNativePlaybackRecovery,
    recoverNativePlaybackFailure,
} from "../nativePlaybackRecovery";
import { resolveCrossProviderPlaybackFallback } from "../crossProviderPlaybackFallback";

type ResolveFallbackOptions = Parameters<
    typeof resolveCrossProviderPlaybackFallback
>[0];

const musicItem = {
    id: "original-1",
    platform: "音悦台",
    title: "Hello",
    artist: "Adele",
} as IMusic.IMusicItem;

const fallback = {
    matchedItem: {
        id: "youtube-1",
        platform: "Youtube",
        title: "Hello",
        artist: "Adele",
    } as IMusic.IMusicItem,
    source: {
        url: "https://rr1.googlevideo.com/audio.m4a?token=runtime",
        quality: "standard" as IMusic.IQualityKey,
    },
};

function createDependencies() {
    return {
        getPluginByName: jest.fn(),
        getPosition: jest.fn(async () => 27),
        replaceSource: jest.fn(async () => undefined),
        resolveFallback: jest.fn(
            async (_options?: ResolveFallbackOptions) => fallback,
        ),
    };
}

describe("native playback recovery", () => {
    it("replaces a failed native source while preserving original identity and position", async () => {
        const dependencies = createDependencies();
        dependencies.resolveFallback.mockImplementation(async options => {
            expect(options?.shouldAbort?.()).toBe(false);
            return fallback;
        });

        await expect(recoverNativePlaybackFailure({
            musicItem,
            qualityOrder: ["standard"],
            isStillCurrent: () => true,
        }, dependencies)).resolves.toBe(true);

        expect(dependencies.resolveFallback).toHaveBeenCalledWith({
            musicItem,
            qualityOrder: ["standard"],
            getPluginByName: dependencies.getPluginByName,
            shouldAbort: expect.any(Function),
        });
        expect(dependencies.replaceSource).toHaveBeenCalledWith(
            fallback.source,
            musicItem,
            27,
        );
    });

    it("does not replace the source when no safe fallback exists", async () => {
        const dependencies = createDependencies();
        dependencies.resolveFallback.mockResolvedValue(null as never);

        await expect(recoverNativePlaybackFailure({
            musicItem,
            qualityOrder: ["standard"],
            isStillCurrent: () => true,
        }, dependencies)).resolves.toBe(false);
        expect(dependencies.replaceSource).not.toHaveBeenCalled();
    });

    it("passes the already-failed provider exclusion to fallback resolution", async () => {
        const dependencies = createDependencies();

        await recoverNativePlaybackFailure({
            musicItem,
            qualityOrder: ["standard"],
            excludedProviderNames: ["Youtube"],
            isStillCurrent: () => true,
        }, dependencies);

        expect(dependencies.resolveFallback).toHaveBeenCalledWith(
            expect.objectContaining({
                excludedProviderNames: ["Youtube"],
            }),
        );
    });

    it("contains unexpected fallback failures", async () => {
        const dependencies = createDependencies();
        dependencies.resolveFallback.mockRejectedValue(new Error("provider failed"));

        await expect(recoverNativePlaybackFailure({
            musicItem,
            qualityOrder: ["standard"],
            isStillCurrent: () => true,
        }, dependencies)).resolves.toBe(false);
        expect(dependencies.replaceSource).not.toHaveBeenCalled();
    });

    it("cancels replacement when the active track changes during lookup", async () => {
        let current = true;
        const dependencies = createDependencies();
        dependencies.resolveFallback.mockImplementation(async () => {
            current = false;
            return fallback;
        });

        await expect(recoverNativePlaybackFailure({
            musicItem,
            qualityOrder: ["standard"],
            isStillCurrent: () => current,
        }, dependencies)).resolves.toBe(false);
        expect(dependencies.replaceSource).not.toHaveBeenCalled();
    });

    it("defaults a failed progress lookup to the beginning", async () => {
        const dependencies = createDependencies();
        dependencies.getPosition.mockRejectedValue(new Error("player unavailable"));

        await expect(recoverNativePlaybackFailure({
            musicItem,
            qualityOrder: ["standard"],
            isStillCurrent: () => true,
        }, dependencies)).resolves.toBe(true);
        expect(dependencies.replaceSource).toHaveBeenCalledWith(
            fallback.source,
            musicItem,
            0,
        );
    });

    it("contains a native replacement failure", async () => {
        const dependencies = createDependencies();
        dependencies.replaceSource.mockRejectedValue(new Error("replacement failed"));

        await expect(recoverNativePlaybackFailure({
            musicItem,
            qualityOrder: ["standard"],
            isStillCurrent: () => true,
        }, dependencies)).resolves.toBe(false);
    });

    it.each([
        { current: 1, attempted: -1, expected: true },
        { current: 2, attempted: 1, expected: true },
        { current: 2, attempted: 2, expected: false },
        { current: 0, attempted: -1, expected: false },
    ])("guards one recovery per positive source attempt %#", ({
        current,
        attempted,
        expected,
    }) => {
        expect(canAttemptNativePlaybackRecovery(current, attempted)).toBe(expected);
    });
});
