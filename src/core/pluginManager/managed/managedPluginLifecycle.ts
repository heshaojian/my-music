import { compare, validate } from "compare-versions";

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

function comparePlugins<TPlugin>(
    left: TPlugin,
    right: TPlugin,
    operations: ManagedPluginOperations<TPlugin>,
) {
    const leftVersion = operations.getVersion(left);
    const rightVersion = operations.getVersion(right);
    const leftIsValid = isValidVersion(leftVersion);
    const rightIsValid = isValidVersion(rightVersion);

    if (leftIsValid !== rightIsValid) {
        return leftIsValid ? -1 : 1;
    }
    if (leftIsValid && rightIsValid) {
        const versionOrder = compare(leftVersion, rightVersion, ">")
            ? -1
            : compare(leftVersion, rightVersion, "<")
                ? 1
                : 0;
        if (versionOrder !== 0) {
            return versionOrder;
        }
    }

    const leftPath = operations.getPath(left);
    const rightPath = operations.getPath(right);
    const pathOrder = leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
    const leftHash = operations.getHash(left);
    const rightHash = operations.getHash(right);
    return pathOrder !== 0
        ? pathOrder
        : leftHash < rightHash ? -1 : leftHash > rightHash ? 1 : 0;
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
    const exactMatches = plugins
        .filter(plugin => operations.getPlatform(plugin) === descriptor.platform)
        .sort((left, right) => comparePlugins(left, right, operations));
    const current = exactMatches[0];
    const currentVersion = current && operations.getVersion(current);

    if (
        current &&
        currentVersion &&
        isValidVersion(currentVersion) &&
        compare(currentVersion, descriptor.version, ">=")
    ) {
        if (exactMatches.length === 1) {
            return { status: "unchanged", plugin: current };
        }

        operations.publishPlugins(replacePlatformPlugins(
            plugins,
            descriptor.platform,
            current,
            operations,
        ));
        await removeFiles(exactMatches.slice(1), operations);
        return { status: "reconciled", plugin: current };
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
