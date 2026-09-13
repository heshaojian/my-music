jest.mock("react-native-fs", () => ({
    __esModule: true,
    default: {
        CachesDirectoryPath: "/native-cache",
        exists: jest.fn(),
        mkdir: jest.fn(),
        stat: jest.fn(),
        downloadFile: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn(),
        appendFile: jest.fn(),
        unlink: jest.fn(),
        moveFile: jest.fn(),
    },
}));

import { prepareIosGoogleVideoSource } from "../iosGoogleVideoCache";
import sha256 from "crypto-js/sha256";

function createFs(totalBytes: number) {
    const files = new Map<string, string>();
    const downloads: string[] = [];
    return {
        downloads,
        files,
        fs: {
            cachesDirectoryPath: "/cache",
            exists: jest.fn(async (file: string) => files.has(file)),
            mkdir: jest.fn(async () => undefined),
            stat: jest.fn(async (file: string) => ({
                size: files.get(file)?.length ?? 0,
            })),
            downloadFile: jest.fn(
                (options: { fromUrl: string; toFile: string }) => {
                    downloads.push(options.fromUrl);
                    const range = new URL(options.fromUrl).searchParams.get(
                        "range",
                    )!;
                    const [start, end] = range.split("-").map(Number);
                    files.set(options.toFile, "x".repeat(end - start + 1));
                    return {
                        promise: Promise.resolve({
                            statusCode: 200,
                            bytesWritten: end - start + 1,
                        }),
                    };
                },
            ),
            readFile: jest.fn(async (file: string) => files.get(file) ?? ""),
            writeFile: jest.fn(async (file: string, data: string) => {
                files.set(file, data);
            }),
            appendFile: jest.fn(async (file: string, data: string) => {
                files.set(file, (files.get(file) ?? "") + data);
            }),
            unlink: jest.fn(async (file: string) => {
                files.delete(file);
            }),
            moveFile: jest.fn(async (from: string, to: string) => {
                files.set(to, files.get(from) ?? "");
                files.delete(from);
            }),
            readDir: jest.fn(async (directory: string) =>
                [...files.entries()]
                    .filter(([file]) => file.startsWith(`${directory}/`))
                    .map(([file, data], index) => ({
                        name: file.slice(directory.length + 1),
                        path: file,
                        size: data.length,
                        mtime: new Date(index * 1000),
                        isFile: () => true,
                    })),
            ),
        },
        source: {
            url: `https://rr1.googlevideo.com/videoplayback?itag=140&clen=${totalBytes}`,
            headers: { "user-agent": "youtube-test" },
            quality: "standard" as const,
        },
    };
}

describe("iOS Googlevideo playback cache", () => {
    it("materializes the signed stream in bounded query ranges for AVFoundation", async () => {
        const fixture = createFs(2_500_000);

        const result = await prepareIosGoogleVideoSource({
            source: fixture.source,
            mediaId: "YQHsXMglC9A",
            platform: "ios",
            fs: fixture.fs,
        });

        expect(
            fixture.downloads.map(url =>
                new URL(url).searchParams.get("range"),
            ),
        ).toEqual(["0-1048575", "1048576-2097151", "2097152-2499999"]);
        expect(result).toMatchObject({ quality: "standard" });
        expect(result.url).toMatch(
            /^file:\/\/\/cache\/mymusic-youtube\/[a-f0-9]{64}-140-2500000\.m4a$/,
        );
        expect(result.headers).toBeUndefined();
    });

    it("uses validated provider metadata when the URL omits clen and itag", async () => {
        const fixture = createFs(1000);
        const source = {
            ...fixture.source,
            url: "https://rr1.googlevideo.com/videoplayback?id=metadata-only",
            contentLength: 1000,
            formatId: 140,
        };

        const result = await prepareIosGoogleVideoSource({
            source,
            mediaId: "YQHsXMglC9A",
            platform: "ios",
            fs: fixture.fs,
        });

        expect(fixture.downloads).toHaveLength(1);
        expect(result.url).toMatch(/-140-1000\.m4a$/);
    });

    it("leaves Android sources untouched", async () => {
        const fixture = createFs(2_500_000);
        await expect(
            prepareIosGoogleVideoSource({
                source: fixture.source,
                mediaId: "YQHsXMglC9A",
                platform: "android",
                fs: fixture.fs,
            }),
        ).resolves.toBe(fixture.source);
        expect(fixture.downloads).toEqual([]);
    });

    it.each([
        "https://example.com/videoplayback?clen=1000",
        "https://rr1.googlevideo.com/videoplayback",
        "https://rr1.googlevideo.com/videoplayback?itag=140&clen=0",
        "https://rr1.googlevideo.com/videoplayback?itag=140&clen=67108865",
        "https://rr1.googlevideo.com/videoplayback?itag=140&clen=1.5",
        "https://rr1.googlevideo.com/videoplayback?itag=140&clen=1e3",
        "https://rr1.googlevideo.com/videoplayback?itag=140&clen=1000&clen=1000",
        "https://rr1.googlevideo.com/videoplayback?clen=1000",
        "https://user:pass@rr1.googlevideo.com/videoplayback?itag=140&clen=1000",
        "https://googlevideo.com.evil.test/videoplayback?itag=140&clen=1000",
        " https://rr1.googlevideo.com/videoplayback?itag=140&clen=1000",
    ])("does not materialize an unsafe or unbounded source: %s", async url => {
        const fixture = createFs(1000);
        const source = { ...fixture.source, url };
        await expect(
            prepareIosGoogleVideoSource({
                source,
                mediaId: "YQHsXMglC9A",
                platform: "ios",
                fs: fixture.fs,
            }),
        ).resolves.toBe(source);
        expect(fixture.downloads).toEqual([]);
    });

    it("reuses a complete cached file without downloading it again", async () => {
        const fixture = createFs(1000);
        const cacheKey = sha256(
            `youtube|YQHsXMglC9A|${fixture.source.url}`,
        ).toString();
        const target = `/cache/mymusic-youtube/${cacheKey}-140-1000.m4a`;
        fixture.files.set(target, "x".repeat(1000));

        await expect(
            prepareIosGoogleVideoSource({
                source: fixture.source,
                mediaId: "YQHsXMglC9A",
                platform: "ios",
                fs: fixture.fs,
            }),
        ).resolves.toMatchObject({
            url: `file://${target}`,
            headers: undefined,
        });
        expect(fixture.downloads).toEqual([]);
    });

    it("removes an open-ended Range header before downloading bounded chunks", async () => {
        const fixture = createFs(1000);
        const source = {
            ...fixture.source,
            userAgent: "fallback-agent",
            headers: {
                ...fixture.source.headers,
                Authorization: "Bearer private",
                Cookie: "private-cookie",
                Range: "bytes=0-",
            },
        };

        await prepareIosGoogleVideoSource({
            source,
            mediaId: "YQHsXMglC9A",
            platform: "ios",
            fs: fixture.fs,
        });

        expect(fixture.fs.downloadFile).toHaveBeenCalledWith(
            expect.objectContaining({
                headers: { "user-agent": "youtube-test" },
            }),
        );
        expect(JSON.stringify(fixture.fs.downloadFile.mock.calls)).not.toContain(
            "private",
        );
    });

    it("uses the normalized userAgent field when no header supplies it", async () => {
        const fixture = createFs(1000);
        await prepareIosGoogleVideoSource({
            source: {
                ...fixture.source,
                headers: undefined,
                userAgent: "normalized-youtube-agent",
            },
            mediaId: "YQHsXMglC9A",
            platform: "ios",
            fs: fixture.fs,
        });

        expect(fixture.fs.downloadFile).toHaveBeenCalledWith(
            expect.objectContaining({
                headers: { "user-agent": "normalized-youtube-agent" },
            }),
        );
    });

    it.each([" bad-agent", "bad-agent\r\nX-Test: injected", ""]) (
        "rejects an unsafe user agent: %p",
        async userAgent => {
            const fixture = createFs(1000);
            await prepareIosGoogleVideoSource({
                source: { ...fixture.source, headers: undefined, userAgent },
                mediaId: "YQHsXMglC9A",
                platform: "ios",
                fs: fixture.fs,
            });
            expect(fixture.fs.downloadFile).toHaveBeenCalledWith(
                expect.objectContaining({ headers: {} }),
            );
        },
    );

    it("cancels stale preparation and removes partial files", async () => {
        const fixture = createFs(2_500_000);
        let stale = false;
        fixture.fs.downloadFile.mockImplementation(
            (options: { fromUrl: string; toFile: string }) => {
                const range = new URL(options.fromUrl).searchParams.get(
                    "range",
                )!;
                const [start, end] = range.split("-").map(Number);
                fixture.files.set(options.toFile, "x".repeat(end - start + 1));
                stale = true;
                return {
                    promise: Promise.resolve({
                        statusCode: 200,
                        bytesWritten: end - start + 1,
                    }),
                };
            },
        );

        await expect(
            prepareIosGoogleVideoSource({
                source: fixture.source,
                mediaId: "YQHsXMglC9A",
                platform: "ios",
                fs: fixture.fs,
                shouldAbort: () => stale,
            }),
        ).rejects.toThrow("cancelled");
        expect(
            [...fixture.files.keys()].some(file => file.includes(".partial")),
        ).toBe(false);
    });

    it("rejects and cleans up a truncated chunk", async () => {
        const fixture = createFs(1000);
        fixture.fs.downloadFile.mockImplementation(
            (options: { toFile: string }) => {
                fixture.files.set(options.toFile, "x".repeat(999));
                return {
                    promise: Promise.resolve({
                        statusCode: 200,
                        bytesWritten: 999,
                    }),
                };
            },
        );

        await expect(
            prepareIosGoogleVideoSource({
                source: fixture.source,
                mediaId: "YQHsXMglC9A",
                platform: "ios",
                fs: fixture.fs,
            }),
        ).rejects.toThrow("Incomplete YouTube playback cache chunk");
        expect(
            [...fixture.files.keys()].some(file => file.includes(".partial")),
        ).toBe(false);
    });

    it("removes crash leftovers and bounds completed cache entries", async () => {
        const fixture = createFs(1000);
        const directory = "/cache/mymusic-youtube";
        fixture.files.set(
            `${directory}/${"0".repeat(64)}-140-1000.m4a`,
            "x".repeat(1000),
        );
        fixture.files.set(
            `${directory}/${"1".repeat(64)}-140-1000.m4a`,
            "x".repeat(1000),
        );
        fixture.files.set(`${directory}/crashed.partial`, "x");
        fixture.files.set(`${directory}/crashed.partial.0.chunk`, "x");
        fixture.files.set(`${directory}/unrelated.txt`, "keep");

        await prepareIosGoogleVideoSource({
            source: fixture.source,
            mediaId: "YQHsXMglC9A",
            platform: "ios",
            fs: fixture.fs,
        });

        const names = [...fixture.files.keys()].filter(file =>
            file.startsWith(`${directory}/`),
        );
        expect(names.filter(file => file.endsWith(".m4a"))).toHaveLength(2);
        expect(names.some(file => file.includes(".partial"))).toBe(false);
        expect(names).toContain(`${directory}/unrelated.txt`);
    });

    it("refuses a new download when cache quota cleanup fails", async () => {
        const fixture = createFs(1000);
        const directory = "/cache/mymusic-youtube";
        fixture.files.set(`${directory}/${"0".repeat(64)}-140-1000.m4a`, "x");
        fixture.files.set(`${directory}/${"1".repeat(64)}-140-1000.m4a`, "x");
        fixture.fs.unlink.mockRejectedValueOnce(new Error("disk denied"));

        await expect(
            prepareIosGoogleVideoSource({
                source: fixture.source,
                mediaId: "YQHsXMglC9A",
                platform: "ios",
                fs: fixture.fs,
            }),
        ).rejects.toThrow("disk denied");
        expect(fixture.downloads).toEqual([]);
    });

    it("serializes concurrent materialization and keeps at most two files", async () => {
        const fixture = createFs(1000);
        const secondSource = {
            ...fixture.source,
            url: `${fixture.source.url}&id=second`,
        };

        await Promise.all([
            prepareIosGoogleVideoSource({
                source: fixture.source,
                mediaId: "first",
                platform: "ios",
                fs: fixture.fs,
            }),
            prepareIosGoogleVideoSource({
                source: secondSource,
                mediaId: "second",
                platform: "ios",
                fs: fixture.fs,
            }),
        ]);

        expect([...fixture.files.keys()].filter(file => file.endsWith(".m4a"))).toHaveLength(2);
    });
});
