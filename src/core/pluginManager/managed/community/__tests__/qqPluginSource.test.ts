import QQ_MANAGED_PLUGIN from "../sources/qqPluginSource";

type QQPlugin = {
    platform: string;
    version: string;
    srcUrl?: string;
    getMediaSource(
        item: { songmid: string },
        quality: "low" | "standard" | "high" | "super",
    ): Promise<{ url: string } | null | undefined>;
};

type AxiosCall = jest.Mock<Promise<{ data: unknown }>, [unknown]>;

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

function sourceResponse(domain: string, purl = "M500test.mp3") {
    return {
        req_0: {
            data: {
                midurlinfo: [{ purl }],
                sip: [domain],
            },
        },
    };
}

function createPlugin({
    request = jest.fn(async (_config: unknown) => ({
        data: sourceResponse("https://isure.stream.qqmusic.qq.com/"),
    })),
    consoleMock = createConsole(),
}: {
    request?: AxiosCall;
    consoleMock?: ConsoleMock;
} = {}) {
    const module = { exports: {} as QQPlugin };
    const axios = Object.assign(request, { get: jest.fn() });
    const dependencies: Record<string, unknown> = {
        axios: { default: axios },
        "crypto-js": {},
        he: {},
    };
    // Mirrors the production plugin sandbox so the bundled source is tested intact.
    // eslint-disable-next-line no-new-func
    const pluginFactory = Function(`
        "use strict";
        return function(require, __musicfree_require, module, exports, console, env, URL, process) {
            ${QQ_MANAGED_PLUGIN.source}
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
    return { plugin: module.exports, request, consoleMock };
}

describe("managed QQ playback", () => {
    it("returns an HTTPS QQ-controlled media candidate unchanged", async () => {
        const { plugin } = createPlugin();

        await expect(plugin.getMediaSource({ songmid: "test" }, "low"))
            .resolves.toEqual({
                url: "https://isure.stream.qqmusic.qq.com/M500test.mp3",
            });
        expect(plugin).not.toHaveProperty("srcUrl");
    });

    it.each([
        "http://relay.invalid/",
        "https://relay.invalid/",
        "https://user:password@isure.stream.qqmusic.qq.com/",
    ])("rejects an unsafe provider media candidate: %s", async domain => {
        const request: AxiosCall = jest.fn(async (_config: unknown) => ({
            data: sourceResponse(domain),
        }));
        const { plugin } = createPlugin({ request });

        await expect(plugin.getMediaSource({ songmid: "test" }, "low"))
            .resolves.toBeUndefined();
    });

    it.each([
        ["https://isure.stream.qqmusic.qq.com/", "M500 test.mp3"],
        ["https://isure.stream.qqmusic.qq.com/", "M500\ttest.mp3"],
        ["https://isure.stream.qqmusic.qq.com/", "M500\ntest.mp3"],
        ["https://isure.stream.qqmusic.qq.com/", "M500\u00a0test.mp3"],
        ["https://isure.stream.qqmusic.qq.com/", "M500\u0000test.mp3"],
        ["https://isure.stream.qqmusic.qq.com/", "M500\u001ftest.mp3"],
        ["https://isure.stream.qqmusic.qq.com/", "M500\u007ftest.mp3"],
        ["https://isure.stream.qqmusic.qq.com/\n", "M500test.mp3"],
        ["https://isure.stream.qqmusic.qq.com/\u0000", "M500test.mp3"],
    ])(
        "rejects whitespace or control injection across sip and purl",
        async (domain, purl) => {
            const request: AxiosCall = jest.fn(async (_config: unknown) => ({
                data: sourceResponse(domain, purl),
            }));
            const { plugin } = createPlugin({ request });

            await expect(plugin.getMediaSource({ songmid: "test" }, "low"))
                .resolves.toBeUndefined();
        },
    );

    it("preserves a valid percent-encoded provider path", async () => {
        const request: AxiosCall = jest.fn(async (_config: unknown) => ({
            data: sourceResponse(
                "https://isure.stream.qqmusic.qq.com/",
                "folder%20name/M500test.mp3",
            ),
        }));
        const { plugin } = createPlugin({ request });

        await expect(plugin.getMediaSource({ songmid: "test" }, "low"))
            .resolves.toEqual({
                url: "https://isure.stream.qqmusic.qq.com/folder%20name/M500test.mp3",
            });
    });

    it.each([
        ["https://isure.stream.qqmusic.qq.com/", "M500\\test.mp3"],
        ["https://isure.stream.qqmusic.qq.com/", "\\relay.invalid/a.mp3"],
        ["https://isure.stream.qqmusic.qq.com\\@relay.invalid/", "M500test.mp3"],
        ["https:\\isure.stream.qqmusic.qq.com/", "M500test.mp3"],
    ])(
        "rejects raw backslashes across sip and purl",
        async (domain, purl) => {
            const request: AxiosCall = jest.fn(async (_config: unknown) => ({
                data: sourceResponse(domain, purl),
            }));
            const { plugin } = createPlugin({ request });

            await expect(plugin.getMediaSource({ songmid: "test" }, "low"))
                .resolves.toBeUndefined();
        },
    );

    it("preserves a percent-encoded backslash in a provider path", async () => {
        const request: AxiosCall = jest.fn(async (_config: unknown) => ({
            data: sourceResponse(
                "https://isure.stream.qqmusic.qq.com/",
                "folder%5Cname/M500test.mp3",
            ),
        }));
        const { plugin } = createPlugin({ request });

        await expect(plugin.getMediaSource({ songmid: "test" }, "low"))
            .resolves.toEqual({
                url: "https://isure.stream.qqmusic.qq.com/folder%5Cname/M500test.mp3",
            });
    });

    it.each([
        "bad%",
        "bad%2",
        "bad%GG",
        "bad\"quote",
        "bad<less",
        "bad>greater",
        "bad^caret",
        "bad`backtick",
        "bad{open",
        "bad}close",
        "bad|pipe",
    ])(
        "rejects malformed escapes or raw-forbidden purl characters",
        async purl => {
            const request: AxiosCall = jest.fn(async (_config: unknown) => ({
                data: sourceResponse(
                    "https://isure.stream.qqmusic.qq.com/",
                    purl,
                ),
            }));
            const { plugin } = createPlugin({ request });

            await expect(plugin.getMediaSource({ songmid: "test" }, "low"))
                .resolves.toBeUndefined();
        },
    );

    it("preserves encoded forbidden characters and normal URL punctuation", async () => {
        const purl = "%22%3C%3E%5E%60%7B%7D%7C%5C%25-._~!$&()*+,;=:@/M500.mp3?x=1#fragment";
        const request: AxiosCall = jest.fn(async (_config: unknown) => ({
            data: sourceResponse(
                "https://isure.stream.qqmusic.qq.com/",
                purl,
            ),
        }));
        const { plugin } = createPlugin({ request });

        await expect(plugin.getMediaSource({ songmid: "test" }, "low"))
            .resolves.toEqual({
                url: `https://isure.stream.qqmusic.qq.com/${purl}`,
            });
    });

    it("does not log response bodies or tokens when the provider fails", async () => {
        const consoleMock = createConsole();
        const request: AxiosCall = jest.fn(async (_config: unknown) => {
            throw Object.assign(new Error("request failed: secret-token"), {
                response: { data: "private-response-body" },
            });
        });
        const { plugin } = createPlugin({ request, consoleMock });

        await expect(plugin.getMediaSource({ songmid: "test" }, "low"))
            .rejects.toThrow("request failed");
        const logOutput = JSON.stringify(Object.values(consoleMock)
            .flatMap(logger => logger.mock.calls));
        expect(logOutput).not.toContain("secret-token");
        expect(logOutput).not.toContain("private-response-body");
    });
});
