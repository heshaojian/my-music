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
