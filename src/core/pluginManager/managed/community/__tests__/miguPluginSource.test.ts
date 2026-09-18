import MIGU_MANAGED_PLUGIN from "../sources/miguPluginSource";

type Plugin = {
    search(query: string, page: number, type: string): Promise<{
        data: Array<{ url?: string }>;
    }>;
    getMediaSource(
        item: { copyrightId: string; url?: string },
        quality: string,
    ): Promise<{ url: string } | undefined>;
    importMusicSheet(url: string): Promise<unknown>;
};

function createPlugin(mediaUrl: string, vipFlag = 0) {
    const requests: string[] = [];
    const get = jest.fn(async (url: string) => {
        requests.push(url);
        if (url.startsWith("https://c.migu.cn/")) {
            return { request: { path: "/share?id=123" } };
        }
        if (url.includes("query_playlist_by_id_tag")) {
            return { data: { rsp: { playList: [{ contentCount: "0" }] } } };
        }
        if (url.includes("scr_search_tag")) {
            return {
                data: {
                    musics: [{
                        id: "1",
                        copyrightId: "copyright-1",
                        songName: "Song",
                        vipFlag,
                        listenUrl: mediaUrl,
                    }],
                    pageNo: 1,
                    pgt: 1,
                },
            };
        }
        return { data: { data: { listenUrl: mediaUrl } } };
    });
    const axios = Object.assign(jest.fn(), { get });
    const module = { exports: {} as Plugin };
    // eslint-disable-next-line no-new-func
    const factory = Function(
        "require", "module", "exports", "URL", "process", MIGU_MANAGED_PLUGIN.source,
    );
    factory(
        (name: string) => {
            if (name === "axios") return { default: axios };
            if (name === "crypto-js") return { MD5: () => ({ toString: () => "hash" }) };
            if (name === "cheerio") return { load: jest.fn() };
            return {};
        },
        module,
        module.exports,
        URL,
        { env: {} },
    );
    return { plugin: module.exports, requests };
}

function expectApprovedUrl(value: string) {
    const parsed = new URL(value);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.username).toBe("");
    expect(parsed.password).toBe("");
    expect(parsed.hostname === "migu.cn" || parsed.hostname.endsWith(".migu.cn"))
        .toBe(true);
}

describe("managed Migu boundaries", () => {
    it("uses approved HTTPS requests and returns only a valid free media URL", async () => {
        const mediaUrl = "https://freetyst.nf.migu.cn/audio/test.mp3";
        const { plugin, requests } = createPlugin(mediaUrl);

        const searchResult = await plugin.search("test", 1, "music");
        expect(searchResult.data).toEqual([expect.objectContaining({ url: mediaUrl })]);
        await expect(plugin.getMediaSource({ copyrightId: "copyright-1" }, "standard"))
            .resolves.toEqual(expect.objectContaining({ url: mediaUrl }));
        requests.forEach(expectApprovedUrl);
        expect(MIGU_MANAGED_PLUGIN.source).toContain("vipFlag === 0");
        expect(MIGU_MANAGED_PLUGIN.source).not.toContain("withCredentials");
        expect(MIGU_MANAGED_PLUGIN.source).not.toContain("xsrfCookieName");
    });

    it.each([
        "http://freetyst.nf.migu.cn/audio.mp3",
        "https://relay.invalid/audio.mp3",
        "https://user:password@freetyst.nf.migu.cn/audio.mp3",
        "https://migu.cn.evil.invalid/audio.mp3",
        "https://freetyst.nf.migu.cn/a b.mp3",
        "https://freetyst.nf.migu.cn/a\tb.mp3",
        "https://freetyst.nf.migu.cn/a\u0000b.mp3",
        "https://freetyst.nf.migu.cn/a\\b.mp3",
        "https://freetyst.nf.migu.cn/bad%GG.mp3",
        "https://freetyst.nf.migu.cn/a|bad.mp3",
    ])("rejects an unsafe final media URL: %s", async mediaUrl => {
        const { plugin } = createPlugin(mediaUrl);

        await expect(plugin.search("test", 1, "music"))
            .resolves.toEqual(expect.objectContaining({ data: [] }));
        await expect(plugin.getMediaSource({ copyrightId: "copyright-1" }, "standard"))
            .resolves.toBeUndefined();
        await expect(plugin.getMediaSource({ copyrightId: "copyright-1", url: mediaUrl }, "standard"))
            .resolves.toBeUndefined();
    });

    it("keeps VIP search results filtered out", async () => {
        const { plugin } = createPlugin("https://freetyst.nf.migu.cn/audio.mp3", 1);

        await expect(plugin.search("test", 1, "music"))
            .resolves.toEqual(expect.objectContaining({ data: [] }));
    });

    it("rejects an HTTP c.migu.cn share URL without making a request", async () => {
        const { plugin, requests } = createPlugin("https://freetyst.nf.migu.cn/audio.mp3");

        await expect(plugin.importMusicSheet("http://c.migu.cn/share?x=1?"))
            .resolves.toBeUndefined();
        expect(requests).toEqual([]);
    });

    it("accepts an HTTPS c.migu.cn share URL and keeps every request HTTPS", async () => {
        const { plugin, requests } = createPlugin("https://freetyst.nf.migu.cn/audio.mp3");

        await expect(plugin.importMusicSheet("https://c.migu.cn/share?x=1?"))
            .resolves.toBeUndefined();
        expect(requests.length).toBeGreaterThan(0);
        requests.forEach(expectApprovedUrl);
    });
});
