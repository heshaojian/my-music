import KUWO_MANAGED_PLUGIN from "../sources/kuwoPluginSource";

type Plugin = {
    search(query: string, page: number, type: string): Promise<unknown>;
    getMediaSource(
        item: { id: string },
        quality: string,
    ): Promise<{ url: string } | undefined>;
};

function createPlugin(mediaUrl: string) {
    const requests: string[] = [];
    const request = jest.fn(async (config: { url: string }) => {
        requests.push(config.url);
        return { data: { abslist: [], PN: 0, RN: 30, TOTAL: 0 } };
    });
    const get = jest.fn(async (url: string) => {
        requests.push(url);
        return { data: { url: mediaUrl } };
    });
    const axios = Object.assign(request, { get });
    const module = { exports: {} as Plugin };
    // eslint-disable-next-line no-new-func
    const factory = Function("require", "module", "exports", "URL", KUWO_MANAGED_PLUGIN.source);
    factory(
        (name: string) => name === "axios"
            ? { default: axios }
            : { decode: (value: string) => value },
        module,
        module.exports,
        URL,
    );
    return { plugin: module.exports, requests };
}

function expectApprovedUrl(value: string) {
    const parsed = new URL(value);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.username).toBe("");
    expect(parsed.password).toBe("");
    expect(parsed.hostname === "kuwo.cn" || parsed.hostname.endsWith(".kuwo.cn"))
        .toBe(true);
}

describe("managed Kuwo boundaries", () => {
    it("uses only approved HTTPS requests and returns a valid provider media URL", async () => {
        const mediaUrl = "https://media.kuwo.cn/audio/test.mp3";
        const { plugin, requests } = createPlugin(mediaUrl);

        await plugin.search("test", 1, "music");
        await expect(plugin.getMediaSource({ id: "1" }, "standard"))
            .resolves.toEqual({ url: mediaUrl });

        requests.forEach(expectApprovedUrl);
    });

    it.each([
        "http://media.kuwo.cn/audio.mp3",
        "https://relay.invalid/audio.mp3",
        "https://user:password@media.kuwo.cn/audio.mp3",
        "https://kuwo.cn.evil.invalid/audio.mp3",
        "https://media.kuwo.cn/a b.mp3",
        "https://media.kuwo.cn/a\tb.mp3",
        "https://media.kuwo.cn/a\u0000b.mp3",
        "https://media.kuwo.cn/a\\b.mp3",
        "https://media.kuwo.cn/bad%GG.mp3",
        "https://media.kuwo.cn/a<bad.mp3",
    ])("rejects an unsafe final media URL: %s", async mediaUrl => {
        const { plugin } = createPlugin(mediaUrl);

        await expect(plugin.getMediaSource({ id: "1" }, "standard"))
            .resolves.toBeUndefined();
    });
});
