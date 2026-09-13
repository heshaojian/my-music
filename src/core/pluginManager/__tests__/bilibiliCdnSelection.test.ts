import BILIBILI_MANAGED_PLUGIN from "../managed/bilibiliPluginSource";

const BILIBILI_PLUGIN_SOURCE = BILIBILI_MANAGED_PLUGIN.source;

type AudioEntry = {
    bandwidth: number;
    baseUrl?: string;
    base_url?: string;
    backupUrl?: string[] | string;
    backup_url?: string[] | string;
};

const createPlugin = (
    os: "ios" | "android",
    audios: AudioEntry[],
    playData: unknown = { dash: { audio: audios } },
) => {
    const get = jest.fn(async (url: string) => {
        if (url.includes("/x/player/pagelist")) {
            return { data: { data: [{ cid: "456" }] } };
        }
        if (url.includes("/x/player/playurl")) {
            return { data: { data: playData } };
        }
        throw new Error(`Unexpected request: ${url}`);
    });
    const module = { exports: {} } as { exports: IPlugin.IPluginInstance };
    const dependencies: Record<string, unknown> = {
        axios: { default: { get, post: jest.fn() } },
        dayjs: Object.assign(jest.fn(), { unix: jest.fn() }),
        he: { decode: (value: string) => value },
        "crypto-js": {},
        cheerio: { load: jest.fn() },
    };
    // Mirrors the production plugin sandbox so the bundled source is tested intact.
    // eslint-disable-next-line no-new-func
    const pluginFactory = Function(`
        "use strict";
        return function(require, module, exports, env, URL) {
            ${BILIBILI_PLUGIN_SOURCE}
        };
    `)();

    pluginFactory(
        (name: string) => dependencies[name],
        module,
        module.exports,
        { os },
        URL,
    );
    return { plugin: module.exports, get };
};

const mediaItem = {
    id: "1",
    platform: "bilibili",
    aid: "123",
    bvid: "BV123",
    cid: "456",
};
const primary = "https://upos-primary.bilivideo.com/audio.m4s?token=primary";
const backup = "https://upos-backup.bilivideo.com/audio.m4s?token=backup";

describe("managed Bilibili CDN selection", () => {
    it("exports the managed identity without a remote update URL", () => {
        const { plugin } = createPlugin("ios", []);

        expect(plugin.platform).toBe("bilibili");
        expect(plugin.version).toBe("0.3.3-mymusic.1");
        expect(plugin).not.toHaveProperty("srcUrl");
        expect(BILIBILI_PLUGIN_SOURCE).not.toContain("console.warn(error)");
    });

    it("prefers the first safe backup URL on iOS", async () => {
        const audios = [{ bandwidth: 128000, baseUrl: primary, backupUrl: [backup] }];
        const { plugin } = createPlugin("ios", audios);

        await expect(plugin.getMediaSource!(mediaItem, "super")).resolves.toMatchObject({
            url: backup,
            headers: { host: "upos-backup.bilivideo.com" },
        });
    });

    it("preserves primary-first ordering on Android", async () => {
        const audios = [{ bandwidth: 128000, baseUrl: primary, backupUrl: [backup] }];
        const { plugin } = createPlugin("android", audios);

        await expect(plugin.getMediaSource!(mediaItem, "super")).resolves.toMatchObject({
            url: primary,
            headers: { host: "upos-primary.bilivideo.com" },
        });
    });

    it("recovers cid from Bilibili pagelist when search results omit it", async () => {
        const audios = [{ bandwidth: 128000, baseUrl: primary, backupUrl: [backup] }];
        const searchResultWithoutCid = {
            ...mediaItem,
            id: "BV123",
            cid: undefined,
        };
        const { plugin, get } = createPlugin("ios", audios);

        await expect(plugin.getMediaSource!(
            searchResultWithoutCid,
            "standard",
        )).resolves.toMatchObject({
            url: backup,
        });
        expect(get).toHaveBeenCalledWith(
            "https://api.bilibili.com/x/player/pagelist",
            expect.objectContaining({
                params: { bvid: "BV123" },
            }),
        );
        expect(get).not.toHaveBeenCalledWith(
            "https://api.bilibili.com/x/web-interface/view",
            expect.anything(),
        );
        expect(get).toHaveBeenCalledWith(
            "https://api.bilibili.com/x/player/playurl",
            expect.objectContaining({
                params: expect.objectContaining({ cid: "456" }),
            }),
        );
    });

    it("supports snake-case Bilibili URL fields", async () => {
        const audios = [{ bandwidth: 128000, base_url: primary, backup_url: [backup] }];
        const { plugin } = createPlugin("ios", audios);

        await expect(plugin.getMediaSource!(mediaItem, "high")).resolves.toMatchObject({
            url: backup,
        });
    });

    it("checks both field aliases instead of letting an unsafe alias hide a safe one", async () => {
        const audios = [{
            bandwidth: 128000,
            baseUrl: "http://unsafe.example.com/audio.m4s",
            base_url: primary,
            backupUrl: ["not a URL"],
            backup_url: backup,
        }];
        const { plugin } = createPlugin("ios", audios);

        await expect(plugin.getMediaSource!(mediaItem, "super")).resolves.toMatchObject({
            url: backup,
        });
    });

    it("preserves non-DASH playback and safely selects its backup candidate", async () => {
        const durl = [{ url: primary, backup_url: [backup] }];
        const { plugin } = createPlugin("ios", [], { durl });

        await expect(plugin.getMediaSource!(mediaItem, "super")).resolves.toMatchObject({
            url: backup,
            headers: { host: "upos-backup.bilivideo.com" },
        });
    });

    it.each([
        "http://unsafe.example.com/audio.m4s",
        "https://user@unsafe.example.com/audio.m4s",
        "https://user:secret@unsafe.example.com/audio.m4s",
        " https://padded.example.com/audio.m4s ",
        "not a URL",
    ])("rejects unsafe backup candidate %s and falls back to primary", async unsafe => {
        const audios = [{ bandwidth: 128000, baseUrl: primary, backupUrl: [unsafe] }];
        const { plugin } = createPlugin("ios", audios);

        await expect(plugin.getMediaSource!(mediaItem, "super")).resolves.toMatchObject({
            url: primary,
        });
    });

    it("uses a safe backup when Android's primary candidate is unsafe", async () => {
        const audios = [{
            bandwidth: 128000,
            baseUrl: "http://unsafe.example.com/audio.m4s",
            backupUrl: [backup],
        }];
        const { plugin } = createPlugin("android", audios);

        await expect(plugin.getMediaSource!(mediaItem, "super")).resolves.toMatchObject({
            url: backup,
        });
    });

    it("selects quality dynamically without mutating the provider audio array", async () => {
        const audios = [
            { bandwidth: 320000, baseUrl: "https://upos-primary.bilivideo.com/high.m4s" },
            { bandwidth: 64000, baseUrl: "https://upos-primary.bilivideo.com/low.m4s" },
            { bandwidth: 128000, baseUrl: "https://upos-primary.bilivideo.com/standard.m4s" },
        ];
        const original = JSON.parse(JSON.stringify(audios));
        const { plugin } = createPlugin("android", audios);

        await expect(plugin.getMediaSource!(mediaItem, "standard")).resolves.toMatchObject({
            url: "https://upos-primary.bilivideo.com/standard.m4s",
        });
        expect(audios).toEqual(original);
    });

    it("returns no source when the selected audio has no safe candidate", async () => {
        const audios = [{
            bandwidth: 128000,
            baseUrl: "http://unsafe.example.com/audio.m4s",
            backupUrl: ["not a URL"],
        }];
        const { plugin } = createPlugin("ios", audios);

        await expect(plugin.getMediaSource!(mediaItem, "super")).resolves.toBeNull();
    });
});
