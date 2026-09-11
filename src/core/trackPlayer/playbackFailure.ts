import type { ILanguageData } from "@/types/core/i18n";

interface PlaybackFailureOptions {
    platform?: string;
    autoStopWhenError: boolean;
}

interface PlaybackFailureDependencies {
    getCurrentDialog(): { name: string | null } | null | undefined;
    showDialog(
        name: "SimpleDialog",
        payload: { title: string; content: string },
    ): unknown;
    translate(
        key: keyof ILanguageData,
        args?: Record<string, string>,
    ): string;
    delay(milliseconds: number): Promise<unknown>;
    skipToNext(): Promise<unknown>;
}

export async function handlePlaybackSourceFailure(
    options: PlaybackFailureOptions,
    dependencies: PlaybackFailureDependencies,
): Promise<void> {
    if (!dependencies.getCurrentDialog()?.name) {
        dependencies.showDialog("SimpleDialog", {
            title: dependencies.translate(
                "dialog.playbackSourceUnavailable.title",
            ),
            content: dependencies.translate(
                "dialog.playbackSourceUnavailable.content",
                { platform: options.platform?.trim() || "Unknown provider" },
            ),
        });
    }

    if (!options.autoStopWhenError) {
        await dependencies.delay(500);
        await dependencies.skipToNext();
    }
}

export function getSafePlaybackErrorDetails(error: {
    code?: unknown;
    message?: unknown;
}): { code: string } {
    const code = typeof error.code === "string" &&
        /^[a-z0-9._-]{1,80}$/i.test(error.code)
        ? error.code
        : "unknown";
    return { code };
}
