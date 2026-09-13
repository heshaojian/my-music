import { validate } from "compare-versions";

export interface ManagedPluginDescriptor {
    readonly platform: string;
    readonly version: string;
    readonly source: string;
}

export interface ManagedPluginOperations<TPlugin> {
    listPlugins(): readonly TPlugin[];
    allocatePaths(): {
        readonly stagingPath: string;
        readonly finalPath: string;
    };
    writeSource(path: string, source: string): Promise<void>;
    readSource(path: string): Promise<string>;
    parsePlugin(source: string, finalPath: string): TPlugin;
    promote(stagingPath: string, finalPath: string): Promise<void>;
    publishPlugins(plugins: readonly TPlugin[]): void;
    removeFile(path: string): Promise<void>;
    getPlatform(plugin: TPlugin): string;
    getVersion(plugin: TPlugin): unknown;
    getPath(plugin: TPlugin): string;
    getHash(plugin: TPlugin): string;
    getSourceHash(source: string): string;
    isUsablePlugin(plugin: TPlugin): boolean;
    canRemoveFile(path: string): boolean;
}

export type ManagedPluginResult<TPlugin> = {
    status: "installed" | "upgraded" | "reconciled" | "unchanged";
    plugin: TPlugin;
};

function isValidVersion(version: unknown): version is string {
    return typeof version === "string" && validate(version);
}

function assertDescriptor(descriptor: ManagedPluginDescriptor) {
    if (
        typeof descriptor.platform !== "string" ||
        descriptor.platform.length === 0 ||
        descriptor.platform.trim() !== descriptor.platform ||
        !isValidVersion(descriptor.version) ||
        typeof descriptor.source !== "string" ||
        descriptor.source.length === 0
    ) {
        throw new Error("Invalid managed plugin descriptor");
    }
}

function replacePlatformPlugins<TPlugin>(
    plugins: readonly TPlugin[],
    platform: string,
    replacement: TPlugin,
    operations: ManagedPluginOperations<TPlugin>,
) {
    const firstIndex = plugins.findIndex(
        plugin => operations.getPlatform(plugin) === platform,
    );
    const withoutPlatform = plugins.filter(
        plugin => operations.getPlatform(plugin) !== platform,
    );
    const insertionIndex = firstIndex === -1
        ? withoutPlatform.length
        : Math.min(firstIndex, withoutPlatform.length);

    return [
        ...withoutPlatform.slice(0, insertionIndex),
        replacement,
        ...withoutPlatform.slice(insertionIndex),
    ];
}

async function removeFiles<TPlugin>(
    plugins: readonly TPlugin[],
    operations: ManagedPluginOperations<TPlugin>,
) {
    for (const plugin of plugins) {
        const path = operations.getPath(plugin);
        if (!operations.canRemoveFile(path)) {
            continue;
        }
        try {
            await operations.removeFile(path);
        } catch {
            // The published registry remains valid. A later bootstrap reconciles
            // any file that could not be removed during this run.
        }
    }
}

export async function ensureManagedPlugin<TPlugin>(
    descriptor: ManagedPluginDescriptor,
    operations: ManagedPluginOperations<TPlugin>,
): Promise<ManagedPluginResult<TPlugin>> {
    assertDescriptor(descriptor);

    const plugins = [...operations.listPlugins()];
    const exactMatches = plugins.filter(
        plugin => operations.getPlatform(plugin) === descriptor.platform,
    );
    const expectedHash = operations.getSourceHash(descriptor.source);
    if (!expectedHash) {
        throw new Error("Invalid managed plugin source hash");
    }
    const trustedCurrent = exactMatches.find(plugin =>
        operations.getHash(plugin) === expectedHash &&
        operations.getVersion(plugin) === descriptor.version,
    );
    const current = trustedCurrent ?? exactMatches[0];

    if (trustedCurrent) {
        if (exactMatches.length === 1) {
            return { status: "unchanged", plugin: trustedCurrent };
        }

        operations.publishPlugins(replacePlatformPlugins(
            plugins,
            descriptor.platform,
            trustedCurrent,
            operations,
        ));
        await removeFiles(
            exactMatches.filter(plugin => plugin !== trustedCurrent),
            operations,
        );
        return { status: "reconciled", plugin: trustedCurrent };
    }

    const { stagingPath, finalPath } = operations.allocatePaths();
    if (!stagingPath || !finalPath || stagingPath === finalPath) {
        throw new Error("Invalid managed plugin paths");
    }

    let promoted = false;
    try {
        await operations.writeSource(stagingPath, descriptor.source);
        const stagedSource = await operations.readSource(stagingPath);
        if (stagedSource !== descriptor.source) {
            throw new Error("Managed plugin verification failed");
        }

        const candidate = operations.parsePlugin(stagedSource, finalPath);
        if (
            operations.getPlatform(candidate) !== descriptor.platform ||
            operations.getVersion(candidate) !== descriptor.version
        ) {
            throw new Error("Managed plugin identity mismatch");
        }
        if (!operations.isUsablePlugin(candidate)) {
            throw new Error("Managed plugin cannot be mounted");
        }

        await operations.promote(stagingPath, finalPath);
        promoted = true;
        operations.publishPlugins(replacePlatformPlugins(
            plugins,
            descriptor.platform,
            candidate,
            operations,
        ));
        await removeFiles(exactMatches, operations);

        return {
            status: current ? "upgraded" : "installed",
            plugin: candidate,
        };
    } catch (error) {
        try {
            const cleanupPath = promoted ? finalPath : stagingPath;
            if (operations.canRemoveFile(cleanupPath)) {
                await operations.removeFile(cleanupPath);
            }
        } catch {
            // Cleanup is best effort; the previous registry was not replaced.
        }
        throw error;
    }
}

export function isOwnedPluginFilePath(
    filePath: string,
    pluginDirectory: string,
) {
    if (!filePath.startsWith(pluginDirectory)) {
        return false;
    }
    const relativePath = filePath.slice(pluginDirectory.length);
    return /^[A-Za-z0-9_-]+\.js$/.test(relativePath) ||
        /^\.[A-Za-z0-9_-]+\.stage$/.test(relativePath);
}
