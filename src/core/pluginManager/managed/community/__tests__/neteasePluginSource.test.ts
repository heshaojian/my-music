import NETEASE_MANAGED_PLUGIN from "../sources/neteasePluginSource";

type NetEasePlugin = {
    platform: string;
    version: string;
    srcUrl?: string;
    getMediaSource(
        item: { id: unknown },
        quality: "low" | "standard" | "high" | "super",
    ): Promise<{ url: string } | undefined>;
};

type ConsoleMock = {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    info: jest.Mock;
};

function createConsole(): ConsoleMock {
    return {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
    };
}

function createPlugin(
    source: string = NETEASE_MANAGED_PLUGIN.source,
    consoleMock = createConsole(),
) {
    const module = { exports: {} as NetEasePlugin };
    const dependencies: Record<string, unknown> = {
        axios: { default: jest.fn() },
        "crypto-js": {},
        qs: {},
        "big-integer": jest.fn(),
        dayjs: {},
        cheerio: {},
    };
    // Mirrors the production plugin sandbox so the bundled source is tested intact.
    // eslint-disable-next-line no-new-func
    const pluginFactory = Function(`
        "use strict";
        return function(require, __musicfree_require, module, exports, console, env, URL, process) {
            ${source}
        };
    `)();
    const requireDependency = (name: string) => dependencies[name];

    pluginFactory(
        requireDependency,
        requireDependency,
        module,
        module.exports,
        consoleMock,
        { os: "ios" },
        URL,
        { env: {} },
    );
    return { plugin: module.exports, consoleMock };
}

describe("managed NetEase playback", () => {
    it("returns only its HTTPS provider media URL", async () => {
        const { plugin } = createPlugin();

        await expect(plugin.getMediaSource({ id: 123 }, "standard"))
            .resolves.toEqual({
                url: "https://music.163.com/song/media/outer/url?id=123.mp3",
            });
        expect(plugin).not.toHaveProperty("srcUrl");
    });

    it.each([
        "http://relay.invalid/a.mp3",
        "https://user:password@music.163.com/a.mp3",
        "https://relay.invalid/a.mp3",
    ])("rejects an unsafe final media candidate: %s", async unsafeUrl => {
        const hostileSource = NETEASE_MANAGED_PLUGIN.source.replace(
            "https://music.163.com/song/media/outer/url?id=${musicItem.id}.mp3",
            unsafeUrl,
        );
        const { plugin } = createPlugin(hostileSource);

        await expect(plugin.getMediaSource({ id: 123 }, "standard"))
            .resolves.toBeUndefined();
    });

    it.each([
        "123 456",
        "123\t456",
        "123\n456",
        "123\u00a0456",
        "123\u0000456",
        "123\u001f456",
        "123\u007f456",
    ])("rejects whitespace or control injection through an item id", async id => {
        const { plugin } = createPlugin();

        await expect(plugin.getMediaSource({ id }, "standard"))
            .resolves.toBeUndefined();
    });

    it("preserves a valid percent-encoded media path", async () => {
        const { plugin } = createPlugin();

        await expect(plugin.getMediaSource({ id: "123%20456" }, "standard"))
            .resolves.toEqual({
                url: "https://music.163.com/song/media/outer/url?id=123%20456.mp3",
            });
    });

    it("rejects a raw backslash injected through an item id", async () => {
        const { plugin } = createPlugin();

        await expect(plugin.getMediaSource({ id: "123\\@relay.invalid" }, "standard"))
            .resolves.toBeUndefined();
    });

    it("preserves a percent-encoded backslash in the media path", async () => {
        const { plugin } = createPlugin();

        await expect(plugin.getMediaSource({ id: "123%5C456" }, "standard"))
            .resolves.toEqual({
                url: "https://music.163.com/song/media/outer/url?id=123%5C456.mp3",
            });
    });

    it("guards the direct media URL projected onto search results", () => {
        expect(NETEASE_MANAGED_PLUGIN.source).toContain(
            "const mediaUrl = isAllowedMediaUrl(candidateUrl, ALLOWED_MEDIA_HOSTS)",
        );
        expect(NETEASE_MANAGED_PLUGIN.source).toContain("url: mediaUrl");
        expect(NETEASE_MANAGED_PLUGIN.source).not.toContain(
            "url: `https://music.163.com/song/media/outer/url?id=${_.id}.mp3`",
        );
    });

    it("does not log provider error details or tokens", async () => {
        const consoleMock = createConsole();
        const failingSource = NETEASE_MANAGED_PLUGIN.source.replace(
            "async function getMediaSource(musicItem, quality) {",
            [
                "async function getMediaSource(musicItem, quality) {",
                "    throw new Error(\"private-response-body secret-token\");",
            ].join("\n"),
        );
        const { plugin } = createPlugin(failingSource, consoleMock);

        await expect(plugin.getMediaSource({ id: 123 }, "standard"))
            .rejects.toThrow("private-response-body");
        const logOutput = JSON.stringify(Object.values(consoleMock)
            .flatMap(logger => logger.mock.calls));
        expect(logOutput).not.toContain("secret-token");
        expect(logOutput).not.toContain("private-response-body");
        expect(consoleMock.log).not.toHaveBeenCalled();
        expect(consoleMock.error).not.toHaveBeenCalled();
    });
});
