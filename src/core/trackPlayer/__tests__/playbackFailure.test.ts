import type { ILanguageData } from "@/types/core/i18n";
import {
    getSafePlaybackErrorDetails,
    handlePlaybackSourceFailure,
} from "../playbackFailure";

describe("playback source failure", () => {
    const createDependencies = () => ({
        getCurrentDialog: jest.fn(
            (): { name: string | null } => ({ name: null }),
        ),
        showDialog: jest.fn(),
        translate: jest.fn((key: keyof ILanguageData, args?: Record<string, string>) => {
            if (key.endsWith("title")) {
                return "Playback unavailable";
            }
            return `Audio from ${args?.platform} is protected or unavailable.`;
        }),
        delay: jest.fn(async () => undefined),
        skipToNext: jest.fn(async () => undefined),
    });

    it("shows a localized, URL-free error and stops when auto-stop is enabled", async () => {
        const dependencies = createDependencies();

        await handlePlaybackSourceFailure({
            platform: "猫耳FM",
            autoStopWhenError: true,
        }, dependencies);

        expect(dependencies.showDialog).toHaveBeenCalledWith("SimpleDialog", {
            title: "Playback unavailable",
            content: "Audio from 猫耳FM is protected or unavailable.",
        });
        expect(dependencies.showDialog.mock.calls.flat().join(" ")).not.toContain("http");
        expect(dependencies.delay).not.toHaveBeenCalled();
        expect(dependencies.skipToNext).not.toHaveBeenCalled();
    });

    it("shows the error before preserving configured next-track behavior", async () => {
        const callOrder: string[] = [];
        const dependencies = {
            ...createDependencies(),
            showDialog: jest.fn(() => callOrder.push("dialog")),
            delay: jest.fn(async () => {
                callOrder.push("delay");
            }),
            skipToNext: jest.fn(async () => {
                callOrder.push("skip");
            }),
        };

        await handlePlaybackSourceFailure({
            platform: "猫耳FM",
            autoStopWhenError: false,
        }, dependencies);

        expect(dependencies.delay).toHaveBeenCalledWith(500);
        expect(dependencies.skipToNext).toHaveBeenCalledTimes(1);
        expect(callOrder).toEqual(["dialog", "delay", "skip"]);
    });

    it.each(["SimpleDialog", "SetScheduleCloseTimeDialog"])(
        "does not replace an existing %s dialog",
        async dialogName => {
            const dependencies = createDependencies();
            dependencies.getCurrentDialog.mockReturnValue({ name: dialogName });

            await handlePlaybackSourceFailure({
                platform: "猫耳FM",
                autoStopWhenError: true,
            }, dependencies);

            expect(dependencies.showDialog).not.toHaveBeenCalled();
        },
    );

    it("never includes a signed media URL in persistent error details", () => {
        const details = getSafePlaybackErrorDetails({
            code: "playback-error",
            message: "Failed https://user:secret@example.com/song.m4a?token=private#key",
        });

        expect(details).toEqual({ code: "playback-error" });
        expect(JSON.stringify(details)).not.toContain("private");
        expect(JSON.stringify(details)).not.toContain("secret");
    });
});
