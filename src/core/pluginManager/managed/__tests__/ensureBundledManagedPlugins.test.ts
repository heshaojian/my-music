import { ensureBundledManagedPlugins } from "../ensureBundledManagedPlugins";
import { errorLog } from "@/utils/log";

jest.mock("@/utils/log", () => ({ errorLog: jest.fn() }));

const descriptor = {
    platform: "bilibili",
    version: "0.3.2-mymusic.1",
    source: "plugin source",
} as const;

describe("bundled managed plugin bootstrap", () => {
    it("registers YouTube after Audiomack and Bilibili by default", async () => {
        const manager = {
            ensureManagedPlugin: jest.fn().mockResolvedValue({
                status: "unchanged",
                plugin: {},
            }),
        };

        await ensureBundledManagedPlugins(manager);

        expect(manager.ensureManagedPlugin.mock.calls.map(
            ([managedDescriptor]) => managedDescriptor.platform,
        )).toEqual(["bilibili", "Audiomack", "Youtube"]);
        expect(manager.ensureManagedPlugin.mock.calls[2][0]).toMatchObject({
            platform: "Youtube",
            version: "0.0.3-mymusic.1",
        });
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
        expect(errorLog).toHaveBeenCalledWith(
            "Managed plugin setup failed",
            { platform: "Youtube" },
        );
        expect(errorLog).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ error: failure }),
        );
    });
});
