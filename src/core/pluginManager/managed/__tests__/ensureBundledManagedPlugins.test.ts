import {
    BUNDLED_MANAGED_PLUGINS,
    ensureBundledManagedPlugins,
    getBundledManagedPlugin,
    getBundledManagedPluginRecommendations,
    isBundledManagedPluginPlatform,
    repairBundledManagedPlugin,
} from "../ensureBundledManagedPlugins";
import { errorLog } from "@/utils/log";

jest.mock("@/utils/log", () => ({ errorLog: jest.fn() }));

const descriptor = {
    platform: "bilibili",
    version: "0.3.3-mymusic.1",
    source: "plugin source",
} as const;

describe("bundled managed plugin bootstrap", () => {
    it("projects every bundled provider without exposing source", () => {
        const recommendations = getBundledManagedPluginRecommendations();

        expect(recommendations).toContainEqual({
            platform: "猫耳FM",
            version: "0.1.6-mymusic.1",
            trust: "official",
            availability: "bundled",
        });
        expect(recommendations).toHaveLength(BUNDLED_MANAGED_PLUGINS.length);
        expect(recommendations.every(item => !("source" in item))).toBe(true);
        expect(recommendations.every(Object.isFrozen)).toBe(true);
        expect(getBundledManagedPluginRecommendations())
            .not.toBe(recommendations);
    });

    it("reserves bundled provider identities from third-party replacement", () => {
        expect(isBundledManagedPluginPlatform("Youtube")).toBe(true);
        expect(isBundledManagedPluginPlatform("快手")).toBe(true);
        expect(isBundledManagedPluginPlatform("Spotify")).toBe(false);
    });

    it("resolves only exact bundled descriptors for local repair", () => {
        expect(getBundledManagedPlugin("猫耳FM")).toMatchObject({
            platform: "猫耳FM",
            version: "0.1.6-mymusic.1",
        });
        expect(getBundledManagedPlugin("猫耳fm")).toBeUndefined();
        expect(getBundledManagedPlugin("unknown")).toBeUndefined();
    });

    it("repairs an exact bundled provider and returns its installed identity", async () => {
        const manager = {
            ensureManagedPlugin: jest.fn(async () => ({
                status: "installed" as const,
                plugin: { name: "猫耳FM", hash: "trusted-hash" },
            })),
        };

        await expect(repairBundledManagedPlugin(manager, "猫耳FM"))
            .resolves.toEqual({
                success: true,
                pluginName: "猫耳FM",
                pluginHash: "trusted-hash",
            });
        expect(manager.ensureManagedPlugin).toHaveBeenCalledWith(
            expect.objectContaining({ platform: "猫耳FM" }),
        );
    });

    it("fails closed for unknown providers without invoking the lifecycle", async () => {
        const manager = { ensureManagedPlugin: jest.fn() };

        await expect(repairBundledManagedPlugin(manager, "猫耳fm"))
            .resolves.toMatchObject({ success: false });
        expect(manager.ensureManagedPlugin).not.toHaveBeenCalled();
    });

    it("redacts managed repair failures", async () => {
        const manager = {
            ensureManagedPlugin: jest.fn().mockRejectedValue(
                new Error("/private/path?token=secret"),
            ),
        };

        await expect(repairBundledManagedPlugin(manager, "猫耳FM"))
            .resolves.toMatchObject({ success: false });
        expect(errorLog).toHaveBeenCalledWith(
            "Managed plugin repair failed",
            { platform: "猫耳FM" },
        );
        expect(JSON.stringify((errorLog as jest.Mock).mock.calls))
            .not.toContain("secret");
    });

    it("registers every official provider as a managed default", async () => {
        const manager = {
            ensureManagedPlugin: jest.fn().mockResolvedValue({
                status: "unchanged",
                plugin: {},
            }),
        };

        await ensureBundledManagedPlugins(manager);

        expect(manager.ensureManagedPlugin.mock.calls.map(
            ([managedDescriptor]) => managedDescriptor.platform,
        )).toEqual([
            "bilibili",
            "Audiomack",
            "Youtube",
            "歌词网",
            "歌词千寻",
            "Navidrome",
            "suno",
            "udio",
            "猫耳FM",
            "快手",
            "音悦台",
            "WebDAV",
        ]);
        expect(manager.ensureManagedPlugin.mock.calls.map(
            ([managedDescriptor]) => [
                managedDescriptor.platform,
                managedDescriptor.version,
            ],
        )).toEqual([
            ["bilibili", "0.3.3-mymusic.1"],
            ["Audiomack", "0.0.3-mymusic.1"],
            ["Youtube", "0.0.3-mymusic.2"],
            ["歌词网", "0.0.1-mymusic.1"],
            ["歌词千寻", "0.0.1-mymusic.1"],
            ["Navidrome", "0.0.1-mymusic.1"],
            ["suno", "0.0.2-mymusic.1"],
            ["udio", "0.0.2-mymusic.1"],
            ["猫耳FM", "0.1.6-mymusic.1"],
            ["快手", "0.0.5-mymusic.1"],
            ["音悦台", "0.0.3-mymusic.1"],
            ["WebDAV", "0.0.3-mymusic.1"],
        ]);
    });

    it("awaits installation", async () => {
        let finish!: () => void;
        const pending = new Promise<void>(resolve => {
            finish = resolve;
        });
        const manager = {
            ensureManagedPlugin: jest.fn(async () => {
                await pending;
                return { status: "installed" as const, plugin: {} };
            }),
        };
        let completed = false;
        const result = ensureBundledManagedPlugins(
            manager,
            [descriptor],
            jest.fn(),
        ).then(() => {
            completed = true;
        });

        await Promise.resolve();
        expect(completed).toBe(false);
        finish();
        await result;
        expect(manager.ensureManagedPlugin).toHaveBeenCalledWith(descriptor);
    });

    it("reports a provider-scoped failure and continues bootstrap", async () => {
        const failure = new Error("invalid plugin");
        const manager = {
            ensureManagedPlugin: jest.fn().mockRejectedValue(failure),
        };
        const onFailure = jest.fn();

        await expect(ensureBundledManagedPlugins(
            manager,
            [descriptor],
            onFailure,
        )).resolves.toBeUndefined();

        expect(onFailure).toHaveBeenCalledWith("bilibili", failure);
    });

    it("continues with later managed plugins after one fails", async () => {
        const secondDescriptor = {
            platform: "second",
            version: "1.0.0",
            source: "second plugin",
        } as const;
        const failure = new Error("invalid plugin");
        const manager = {
            ensureManagedPlugin: jest.fn()
                .mockRejectedValueOnce(failure)
                .mockResolvedValueOnce({ status: "installed", plugin: {} }),
        };
        const onFailure = jest.fn();

        await ensureBundledManagedPlugins(
            manager,
            [descriptor, secondDescriptor],
            onFailure,
        );

        expect(manager.ensureManagedPlugin.mock.calls).toEqual([
            [descriptor],
            [secondDescriptor],
        ]);
        expect(onFailure).toHaveBeenCalledWith("bilibili", failure);
    });

    it("uses a redacted default failure log", async () => {
        const failure = new Error("https://signed.example/?token=secret");
        const manager = {
            ensureManagedPlugin: jest.fn().mockRejectedValue(failure),
        };

        await ensureBundledManagedPlugins(manager);

        expect(errorLog).toHaveBeenCalledWith(
            "Managed plugin setup failed",
            { platform: "bilibili" },
        );
        expect(errorLog).toHaveBeenCalledWith(
            "Managed plugin setup failed",
            { platform: "Audiomack" },
        );
        expect(errorLog).toHaveBeenCalledTimes(12);
        expect(errorLog).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ error: failure }),
        );
    });
});
