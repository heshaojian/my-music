import { Platform } from "react-native";
import sha256 from "crypto-js/sha256";

const CHUNK_BYTES = 1024 * 1024;
const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
const ABORTED_ERROR = "YouTube playback preparation cancelled";
let materializationQueue: Promise<void> = Promise.resolve();

interface FileSystemAdapter {
    cachesDirectoryPath: string;
    exists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;
    stat(path: string): Promise<{ size: number | string }>;
    downloadFile(options: {
        fromUrl: string;
        toFile: string;
        headers?: Record<string, string>;
        background?: boolean;
    }): { promise: Promise<{ statusCode: number; bytesWritten: number }> };
    readFile(path: string, encoding: "base64"): Promise<string>;
    writeFile(path: string, data: string, encoding: "base64"): Promise<void>;
    appendFile(path: string, data: string, encoding: "base64"): Promise<void>;
    unlink(path: string): Promise<void>;
    moveFile(from: string, to: string): Promise<void>;
    readDir(path: string): Promise<Array<{
        name: string;
        path: string;
        size: number;
        mtime?: Date;
        isFile(): boolean;
    }>>;
}

interface PrepareOptions {
    source: IPlugin.IMediaSourceResult;
    mediaId: string;
    platform?: string;
    fs?: FileSystemAdapter;
    shouldAbort?: () => boolean;
}

function createDefaultFileSystem(): FileSystemAdapter {
    const RNFS = require("react-native-fs") as typeof import("react-native-fs");
    return {
        cachesDirectoryPath: RNFS.CachesDirectoryPath,
        exists: RNFS.exists,
        mkdir: RNFS.mkdir,
        stat: RNFS.stat,
        downloadFile: RNFS.downloadFile,
        readFile: RNFS.readFile,
        writeFile: RNFS.writeFile,
        appendFile: RNFS.appendFile,
        unlink: RNFS.unlink,
        moveFile: RNFS.moveFile,
        readDir: RNFS.readDir,
    } as FileSystemAdapter;
}

function hasControlCharacter(value: string) {
    return Array.from(value).some(character => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
    });
}

function parseGoogleVideoSource(
    sourceUrl: string,
    platform: string,
    suppliedContentLength?: number,
    suppliedFormatId?: number,
) {
    if (platform !== "ios") {
        return null;
    }
    try {
        if (sourceUrl !== sourceUrl.trim() || hasControlCharacter(sourceUrl)) {
            return null;
        }
        const parsed = new URL(sourceUrl);
        const hostname = parsed.hostname.toLowerCase();
        if (
            parsed.protocol !== "https:" ||
            parsed.username ||
            parsed.password ||
            !(
                hostname === "googlevideo.com" ||
                hostname.endsWith(".googlevideo.com")
            )
        ) {
            return null;
        }
        const contentLengthValues = parsed.searchParams.getAll("clen");
        const itagValues = parsed.searchParams.getAll("itag");
        if (
            contentLengthValues.length > 1 ||
            itagValues.length > 1 ||
            (contentLengthValues.length === 1 && !/^[1-9]\d*$/.test(contentLengthValues[0])) ||
            (itagValues.length === 1 && !/^[1-9]\d*$/.test(itagValues[0]))
        ) {
            return null;
        }
        const urlContentLength = contentLengthValues.length === 1
            ? Number(contentLengthValues[0])
            : undefined;
        const urlFormatId = itagValues.length === 1
            ? Number(itagValues[0])
            : undefined;
        if (
            (urlContentLength !== undefined && suppliedContentLength !== undefined &&
                urlContentLength !== suppliedContentLength) ||
            (urlFormatId !== undefined && suppliedFormatId !== undefined &&
                urlFormatId !== suppliedFormatId)
        ) {
            return null;
        }
        const contentLength = urlContentLength ?? suppliedContentLength;
        const itag = urlFormatId ?? suppliedFormatId;
        return typeof contentLength === "number" &&
            typeof itag === "number" &&
            Number.isSafeInteger(contentLength) &&
            contentLength > 0 &&
            contentLength <= MAX_MEDIA_BYTES &&
            Number.isSafeInteger(itag) &&
            itag <= 9999
            ? { contentLength, itag }
            : null;
    } catch {
        return null;
    }
}

function allowedDownloadHeaders(
    source: IPlugin.IMediaSourceResult,
): Record<string, string> {
    const isSafeUserAgent = (value: unknown): value is string =>
        typeof value === "string" &&
        value.length > 0 &&
        value.length <= 1024 &&
        value === value.trim() &&
        !hasControlCharacter(value);
    const headerUserAgent = Object.entries(source.headers ?? {}).find(
        ([key, value]) =>
            key.toLowerCase() === "user-agent" &&
            isSafeUserAgent(value),
    )?.[1];
    const userAgent = headerUserAgent ||
        (isSafeUserAgent(source.userAgent)
            ? source.userAgent
            : undefined);
    return userAgent ? { "user-agent": userAgent } : {};
}

async function safeUnlink(fs: FileSystemAdapter, file: string) {
    try {
        if (await fs.exists(file)) {
            await fs.unlink(file);
        }
    } catch {}
}

async function prunePlaybackCache(
    fs: FileSystemAdapter,
    directory: string,
    target: string,
) {
    const entries = await fs.readDir(directory);
    const completed = entries
        .filter(entry => entry.isFile() && /^[a-f0-9]{64}-\d+-\d+\.m4a$/.test(entry.name))
        .sort((left, right) =>
            (right.mtime?.getTime() ?? 0) - (left.mtime?.getTime() ?? 0),
        );
    const retained = new Set([
        target,
        ...completed.filter(entry => entry.path !== target).slice(0, 1).map(entry => entry.path),
    ]);
    for (const entry of entries) {
        const isOrphan = entry.isFile() &&
            (entry.name.includes(".partial") || entry.name.endsWith(".chunk"));
        const isOldCompleted = completed.includes(entry) && !retained.has(entry.path);
        if (isOrphan || isOldCompleted) {
            await fs.unlink(`${directory}/${entry.name}`);
        }
    }
    const remaining = (await fs.readDir(directory)).filter(
        entry => entry.isFile() && /^[a-f0-9]{64}-\d+-\d+\.m4a$/.test(entry.name),
    );
    if (remaining.length > 2) {
        throw new Error("YouTube playback cache quota could not be restored");
    }
}

async function serializeMaterialization<T>(work: () => Promise<T>): Promise<T> {
    const previous = materializationQueue;
    let release!: () => void;
    materializationQueue = new Promise<void>(resolve => {
        release = resolve;
    });
    await previous;
    try {
        return await work();
    } finally {
        release();
    }
}

async function materializeIosGoogleVideoSource({
    source,
    mediaId,
    platform,
    shouldAbort,
    fs,
}: Required<Pick<PrepareOptions, "platform" | "shouldAbort">> & PrepareOptions): Promise<IPlugin.IMediaSourceResult> {
    const remoteUrl = source.url;
    if (typeof remoteUrl !== "string") {
        return source;
    }
    const parsedSource = parseGoogleVideoSource(
        remoteUrl,
        platform,
        source.contentLength,
        source.formatId,
    );
    if (!parsedSource) {
        return source;
    }
    const { contentLength, itag } = parsedSource;
    const fileSystem = fs ?? createDefaultFileSystem();

    const directory = `${fileSystem.cachesDirectoryPath}/mymusic-youtube`;
    const cacheKey = sha256(`youtube|${mediaId}|${remoteUrl}`).toString();
    const target = `${directory}/${cacheKey}-${itag}-${contentLength}.m4a`;
    if (!(await fileSystem.exists(directory))) {
        await fileSystem.mkdir(directory);
    }
    await prunePlaybackCache(fileSystem, directory, target);
    if (await fileSystem.exists(target)) {
        const existing = await fileSystem.stat(target);
        if (Number(existing.size) === contentLength) {
            return { ...source, url: `file://${target}`, headers: undefined };
        }
        await safeUnlink(fileSystem, target);
    }

    const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const partial = `${target}.${operationId}.partial`;
    let activeChunk = "";
    try {
        const requestHeaders = allowedDownloadHeaders(source);
        for (let start = 0; start < contentLength; start += CHUNK_BYTES) {
            if (shouldAbort()) {
                throw new Error(ABORTED_ERROR);
            }
            const end = Math.min(contentLength - 1, start + CHUNK_BYTES - 1);
            const chunkUrl = new URL(remoteUrl);
            chunkUrl.searchParams.set("range", `${start}-${end}`);
            activeChunk = `${partial}.${start}.chunk`;
            const result = await fileSystem.downloadFile({
                fromUrl: chunkUrl.toString(),
                toFile: activeChunk,
                headers: requestHeaders,
                background: false,
            }).promise;
            if (shouldAbort()) {
                throw new Error(ABORTED_ERROR);
            }
            const expectedBytes = end - start + 1;
            if (
                (result.statusCode !== 200 && result.statusCode !== 206) ||
                result.bytesWritten !== expectedBytes
            ) {
                throw new Error("Incomplete YouTube playback cache chunk");
            }
            const data = await fileSystem.readFile(activeChunk, "base64");
            if (start === 0) {
                await fileSystem.writeFile(partial, data, "base64");
            } else {
                await fileSystem.appendFile(partial, data, "base64");
            }
            await safeUnlink(fileSystem, activeChunk);
            activeChunk = "";
        }

        const completed = await fileSystem.stat(partial);
        if (Number(completed.size) !== contentLength) {
            throw new Error("Incomplete YouTube playback cache file");
        }
        if (shouldAbort()) {
            throw new Error(ABORTED_ERROR);
        }
        await fileSystem.moveFile(partial, target);
        await prunePlaybackCache(fileSystem, directory, target);
        return { ...source, url: `file://${target}`, headers: undefined };
    } catch (error) {
        await safeUnlink(fileSystem, activeChunk);
        await safeUnlink(fileSystem, partial);
        throw error;
    }
}

export async function prepareIosGoogleVideoSource({
    source,
    mediaId,
    platform = Platform.OS,
    shouldAbort = () => false,
    fs,
}: PrepareOptions): Promise<IPlugin.IMediaSourceResult> {
    if (
        typeof source.url !== "string" ||
        !parseGoogleVideoSource(
            source.url,
            platform,
            source.contentLength,
            source.formatId,
        )
    ) {
        return source;
    }
    return serializeMaterialization(() =>
        materializeIosGoogleVideoSource({ source, mediaId, platform, shouldAbort, fs }),
    );
}
