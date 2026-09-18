import XIMALAYA_MANAGED_PLUGIN from "../sources/ximalayaPluginSource";

type Plugin = {
    search(query: string, page: number, type: string): Promise<unknown>;
    getMediaSource(
        item: { id: string },
        quality: string,
    ): Promise<{ url: string } | undefined>;
};

function createPlugin(mediaUrl: string) {
    const requests: string[] = [];
    const get = jest.fn(async (url: string) => {
        requests.push(url);
        if (url.includes("revision/search/main")) {
            return { data: { data: { track: { totalPage: 1, docs: [] } } } };
        }
        return { data: { trackInfo: { playUrlList: [{ url: "encoded" }] } } };
    });
    const axios = { get };
    const crypto = {
        AES: { decrypt: () => ({ toString: () => mediaUrl }) },
        enc: {
            Base64url: { parse: (value: string) => value },
            Hex: { parse: (value: string) => value },
            Utf8: "utf8",
        },
        mode: { ECB: "ecb" },
        pad: { Pkcs7: "pkcs7" },
    };
    const module = { exports: {} as Plugin };
    // eslint-disable-next-line no-new-func
    const factory = Function("require", "module", "exports", "URL", XIMALAYA_MANAGED_PLUGIN.source);
    factory(
        (name: string) => name === "axios"
            ? { default: axios }
            : crypto,
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
    expect([
        "ximalaya.com",
        "xmcdn.com",
    ].some(suffix => parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`)))
        .toBe(true);
}

describe("managed Ximalaya boundaries", () => {
    it("uses only approved HTTPS requests and returns a valid provider media URL", async () => {
        const mediaUrl = "https://audiopay.cos.tx.xmcdn.com/audio/test.m4a";
        const { plugin, requests } = createPlugin(mediaUrl);

        await plugin.search("test", 1, "music");
        await expect(plugin.getMediaSource({ id: "1" }, "standard"))
            .resolves.toEqual({ url: mediaUrl });
        requests.forEach(expectApprovedUrl);
    });

    it.each([
        "http://audiopay.cos.tx.xmcdn.com/audio.m4a",
        "https://relay.invalid/audio.m4a",
        "https://user:password@audiopay.cos.tx.xmcdn.com/audio.m4a",
        "https://xmcdn.com.evil.invalid/audio.m4a",
        "https://audiopay.cos.tx.xmcdn.com/a b.m4a",
        "https://audiopay.cos.tx.xmcdn.com/a\tb.m4a",
        "https://audiopay.cos.tx.xmcdn.com/a\u0000b.m4a",
        "https://audiopay.cos.tx.xmcdn.com/a\\b.m4a",
        "https://audiopay.cos.tx.xmcdn.com/bad%GG.m4a",
        "https://audiopay.cos.tx.xmcdn.com/a^bad.m4a",
    ])("rejects an unsafe final media URL: %s", async mediaUrl => {
        const { plugin } = createPlugin(mediaUrl);

        await expect(plugin.getMediaSource({ id: "1" }, "standard"))
            .resolves.toBeUndefined();
    });
});
