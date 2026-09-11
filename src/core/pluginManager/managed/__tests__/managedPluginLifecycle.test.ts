import {
    ensureManagedPlugin,
    isOwnedPluginFilePath,
    ManagedPluginDescriptor,
    ManagedPluginOperations,
} from "../managedPluginLifecycle";

interface TestPlugin {
    name: string;
    version?: string;
    hash: string;
    path: string;
}

const descriptor: ManagedPluginDescriptor = {
    platform: "bilibili",
    version: "0.3.2-mymusic.1",
    source: "module.exports = { platform: 'bilibili' };",
};

function createHarness(initial: TestPlugin[] = []) {
    let plugins = [...initial];
    const files = new Map<string, string>();
    const events: string[] = [];
    const operations: ManagedPluginOperations<TestPlugin> = {
        listPlugins: () => plugins,
        allocatePaths: () => ({
            stagingPath: "/plugins/.managed-bilibili.stage",
            finalPath: "/plugins/managed-bilibili.js",
        }),
        writeSource: async (path, source) => {
            events.push(`write:${path}`);
            files.set(path, source);
        },
        readSource: async path => {
            events.push(`read:${path}`);
            const source = files.get(path);
            if (source === undefined) {
                throw new Error("missing file");
            }
            return source;
        },
        parsePlugin: (source, path) => {
            events.push(`verify:${path}`);
            return {
                name: source.includes("wrong-platform") ? "other" : "bilibili",
                version: source.includes("wrong-version")
                    ? "9.9.9"
                    : descriptor.version,
                hash: "managed-hash",
                path,
            };
        },
        promote: async (from, to) => {
            events.push(`promote:${from}->${to}`);
            const source = files.get(from);
            if (source === undefined) {
                throw new Error("missing staging file");
            }
            files.set(to, source);
            files.delete(from);
        },
        publishPlugins: next => {
            events.push("publish");
            plugins = [...next];
        },
        removeFile: async path => {
            events.push(`remove:${path}`);
            files.delete(path);
        },
        getPlatform: plugin => plugin.name,
        getVersion: plugin => plugin.version,
        getPath: plugin => plugin.path,
        getHash: plugin => plugin.hash,
        isUsablePlugin: () => true,
        canRemoveFile: () => true,
    };

    return {
        events,
        files,
        getPlugins: () => plugins,
        operations,
    };
}

describe("managed plugin lifecycle", () => {
    it.each([
        "/plugins/abc_123-def.js",
        "/plugins/.abc_123-def.stage",
    ])("recognizes owned plugin file %s", path => {
        expect(isOwnedPluginFilePath(path, "/plugins/")).toBe(true);
    });

    it.each([
        "/documents/private.db",
        "/plugins/../private.db",
        "/plugins/nested/plugin.js",
        "/plugins/plugin.txt",
        "/plugins/.stage",
    ])("rejects non-owned plugin file %s", path => {
        expect(isOwnedPluginFilePath(path, "/plugins/")).toBe(false);
    });

    it("installs through write, read, verify, promote, publish order", async () => {
        const harness = createHarness();

        await expect(ensureManagedPlugin(descriptor, harness.operations))
            .resolves.toMatchObject({ status: "installed" });

        expect(harness.events).toEqual([
            "write:/plugins/.managed-bilibili.stage",
            "read:/plugins/.managed-bilibili.stage",
            "verify:/plugins/managed-bilibili.js",
            "promote:/plugins/.managed-bilibili.stage->/plugins/managed-bilibili.js",
            "publish",
        ]);
        expect(harness.getPlugins()).toEqual([
            expect.objectContaining({
                name: "bilibili",
                version: descriptor.version,
                path: "/plugins/managed-bilibili.js",
            }),
        ]);
    });

    it("upgrades an older exact-platform plugin and removes it after publish", async () => {
        const oldPlugin: TestPlugin = {
            name: "bilibili",
            version: "0.3.0",
            hash: "old",
            path: "/plugins/old.js",
        };
        const harness = createHarness([oldPlugin]);

        await ensureManagedPlugin(descriptor, harness.operations);

        expect(harness.events.indexOf("publish")).toBeLessThan(
            harness.events.indexOf("remove:/plugins/old.js"),
        );
        expect(harness.getPlugins()).not.toContain(oldPlugin);
    });

    it("upgrades the upstream 0.3.1 release to the managed fix", async () => {
        const upstream: TestPlugin = {
            name: "bilibili",
            version: "0.3.1",
            hash: "upstream",
            path: "/plugins/upstream.js",
        };
        const harness = createHarness([upstream]);

        await expect(ensureManagedPlugin(descriptor, harness.operations))
            .resolves.toMatchObject({ status: "upgraded" });
        expect(harness.events).toContain("remove:/plugins/upstream.js");
    });

    it("does not downgrade a newer exact-platform plugin", async () => {
        const newer: TestPlugin = {
            name: "bilibili",
            version: "0.4.0",
            hash: "newer",
            path: "/plugins/newer.js",
        };
        const harness = createHarness([newer]);

        await expect(ensureManagedPlugin(descriptor, harness.operations))
            .resolves.toEqual({ status: "unchanged", plugin: newer });
        expect(harness.events).toEqual([]);
    });

    it("replaces an exact-platform plugin whose version is invalid", async () => {
        const invalidVersion: TestPlugin = {
            name: "bilibili",
            version: "not-semver",
            hash: "invalid",
            path: "/plugins/invalid.js",
        };
        const harness = createHarness([invalidVersion]);

        await expect(ensureManagedPlugin(descriptor, harness.operations))
            .resolves.toMatchObject({ status: "upgraded" });
        expect(harness.events).toContain("remove:/plugins/invalid.js");
    });

    it("leaves similarly named platforms untouched", async () => {
        const similar: TestPlugin = {
            name: "Bilibili",
            version: "9.0.0",
            hash: "similar",
            path: "/plugins/similar.js",
        };
        const harness = createHarness([similar]);

        await ensureManagedPlugin(descriptor, harness.operations);

        expect(harness.getPlugins()).toEqual([
            similar,
            expect.objectContaining({ name: "bilibili" }),
        ]);
        expect(harness.events).not.toContain("remove:/plugins/similar.js");
    });

    it("reconciles exact-platform duplicates deterministically", async () => {
        const laterPath: TestPlugin = {
            name: "bilibili",
            version: "0.4.0",
            hash: "z",
            path: "/plugins/z.js",
        };
        const earlierPath: TestPlugin = {
            name: "bilibili",
            version: "0.4.0",
            hash: "a",
            path: "/plugins/a.js",
        };
        const other: TestPlugin = {
            name: "other",
            version: "1.0.0",
            hash: "other",
            path: "/plugins/other.js",
        };
        const harness = createHarness([laterPath, other, earlierPath]);

        await expect(ensureManagedPlugin(descriptor, harness.operations))
            .resolves.toEqual({ status: "reconciled", plugin: earlierPath });

        expect(harness.getPlugins()).toEqual([earlierPath, other]);
        expect(harness.events).toEqual(["publish", "remove:/plugins/z.js"]);
    });

    it("never removes a plugin path rejected by the filesystem boundary", async () => {
        const unsafe: TestPlugin = {
            name: "bilibili",
            version: "0.3.1",
            hash: "unsafe",
            path: "/documents/private.db",
        };
        const harness = createHarness([unsafe]);
        harness.operations.canRemoveFile = path => path.startsWith("/plugins/");

        await ensureManagedPlugin(descriptor, harness.operations);

        expect(harness.events).not.toContain("remove:/documents/private.db");
    });

    it("chooses the highest valid duplicate over invalid and older versions", async () => {
        const invalid = {
            name: "bilibili",
            version: "unknown",
            hash: "invalid",
            path: "/plugins/invalid.js",
        };
        const older = {
            name: "bilibili",
            version: "0.4.0",
            hash: "older",
            path: "/plugins/older.js",
        };
        const newest = {
            name: "bilibili",
            version: "0.5.0",
            hash: "newest",
            path: "/plugins/newest.js",
        };
        const harness = createHarness([invalid, older, newest]);

        await expect(ensureManagedPlugin(descriptor, harness.operations))
            .resolves.toEqual({ status: "reconciled", plugin: newest });
        expect(harness.getPlugins()).toEqual([newest]);
    });

    it.each([
        ["wrong platform", "wrong-platform"],
        ["wrong version", "wrong-version"],
    ])("rejects a bundled plugin with %s before promotion", async (_name, source) => {
        const oldPlugin: TestPlugin = {
            name: "bilibili",
            version: "0.3.0",
            hash: "old",
            path: "/plugins/old.js",
        };
        const harness = createHarness([oldPlugin]);

        await expect(ensureManagedPlugin(
            { ...descriptor, source },
            harness.operations,
        )).rejects.toThrow("Managed plugin identity mismatch");

        expect(harness.events).not.toEqual(expect.arrayContaining(["publish"]));
        expect(harness.getPlugins()).toEqual([oldPlugin]);
    });

    it("rejects a matching but unusable candidate before promotion", async () => {
        const oldPlugin: TestPlugin = {
            name: "bilibili",
            version: "0.3.0",
            hash: "old",
            path: "/plugins/old.js",
        };
        const harness = createHarness([oldPlugin]);
        harness.operations.isUsablePlugin = () => false;

        await expect(ensureManagedPlugin(descriptor, harness.operations))
            .rejects.toThrow("Managed plugin cannot be mounted");
        expect(harness.events.some(event => event.startsWith("promote:")))
            .toBe(false);
        expect(harness.getPlugins()).toEqual([oldPlugin]);
    });

    it("retains the old plugin when promotion fails", async () => {
        const oldPlugin: TestPlugin = {
            name: "bilibili",
            version: "0.3.0",
            hash: "old",
            path: "/plugins/old.js",
        };
        const harness = createHarness([oldPlugin]);
        harness.operations.promote = async () => {
            throw new Error("disk full");
        };

        await expect(ensureManagedPlugin(descriptor, harness.operations))
            .rejects.toThrow("disk full");
        expect(harness.getPlugins()).toEqual([oldPlugin]);
        expect(harness.events).not.toEqual(expect.arrayContaining(["publish"]));
    });

    it("rejects invalid paths before writing", async () => {
        const harness = createHarness();
        harness.operations.allocatePaths = () => ({
            stagingPath: "/plugins/same",
            finalPath: "/plugins/same",
        });

        await expect(ensureManagedPlugin(descriptor, harness.operations))
            .rejects.toThrow("Invalid managed plugin paths");
        expect(harness.events).toEqual([]);
    });

    it("rejects a changed staging file before promotion", async () => {
        const harness = createHarness();
        harness.operations.readSource = async path => {
            harness.events.push(`read:${path}`);
            return "changed source";
        };

        await expect(ensureManagedPlugin(descriptor, harness.operations))
            .rejects.toThrow("Managed plugin verification failed");
        expect(harness.events.some(event => event.startsWith("promote:")))
            .toBe(false);
    });

    it.each([
        { ...descriptor, platform: "" },
        { ...descriptor, platform: " bilibili" },
        { ...descriptor, version: "invalid" },
        { ...descriptor, source: "" },
    ])("rejects an invalid descriptor before filesystem access", async invalid => {
        const harness = createHarness();

        await expect(ensureManagedPlugin(invalid, harness.operations))
            .rejects.toThrow("Invalid managed plugin descriptor");
        expect(harness.events).toEqual([]);
    });

    it("ignores old-file cleanup failures after publishing the replacement", async () => {
        const oldPlugin: TestPlugin = {
            name: "bilibili",
            version: "0.3.0",
            hash: "old",
            path: "/plugins/old.js",
        };
        const harness = createHarness([oldPlugin]);
        harness.operations.removeFile = async path => {
            harness.events.push(`remove:${path}`);
            throw new Error("busy");
        };

        await expect(ensureManagedPlugin(descriptor, harness.operations))
            .resolves.toMatchObject({ status: "upgraded" });
        expect(harness.getPlugins()).toEqual([
            expect.objectContaining({ hash: "managed-hash" }),
        ]);
    });
});
