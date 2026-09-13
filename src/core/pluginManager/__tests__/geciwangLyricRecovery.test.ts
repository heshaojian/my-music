import GECIWANG_MANAGED_PLUGIN from "../managed/geciwangPluginSource";

type AxiosGet = jest.Mock<Promise<unknown>, [string, unknown?]>;

const createGet = (
    implementation: (url: string, config?: unknown) => Promise<unknown>,
): AxiosGet => jest.fn<Promise<unknown>, [string, unknown?]>(implementation);

const createPlugin = (get: AxiosGet = jest.fn()) => {
    const module = { exports: {} } as { exports: IPlugin.IPluginInstance };
    const dependencies: Record<string, unknown> = {
        axios: { default: { get } },
        cheerio: require("cheerio"),
    };

    // Mirrors the production plugin sandbox so the bundled source is tested intact.
    // eslint-disable-next-line no-new-func
    const pluginFactory = Function(`
        "use strict";
        return function(require, module, exports) {
            ${GECIWANG_MANAGED_PLUGIN.source}
        };
    `)();

    pluginFactory(
        (name: string) => dependencies[name],
        module,
        module.exports,
    );
    return { plugin: module.exports, get };
};

const searchHtml = `
<table class="table table-striped">
  <tbody>
    <tr>
      <td>梦见周杰伦</td>
      <td>黑色牧羊</td>
      <td>梦见周杰伦</td>
      <td><a href="/lyrics/32342/meng-jian-zhou-jie-lun">歌词</a></td>
    </tr>
    <tr>
      <td>你好,周杰伦</td>
      <td>许嵩</td>
      <td></td>
      <td><a href="https://zh.followlyrics.com/lyrics/116456/ni-hao-zhou-jie-lun">歌词</a></td>
    </tr>
  </tbody>
</table>
`;

describe("managed 歌词网 lyric recovery", () => {
    it("exports a lyric-only managed plugin identity without a remote updater", () => {
        const { plugin } = createPlugin();

        expect(GECIWANG_MANAGED_PLUGIN).toMatchObject({
            platform: "歌词网",
            version: "0.0.1-mymusic.1",
        });
        expect(plugin.platform).toBe("歌词网");
        expect(plugin.version).toBe("0.0.1-mymusic.1");
        expect(plugin.supportedSearchType).toEqual(["lyric"]);
        expect(plugin.cacheControl).toBe("no-store");
        expect(plugin).not.toHaveProperty("srcUrl");
        expect(Object.keys(plugin)).toEqual(expect.arrayContaining([
            "search",
            "getLyric",
        ]));
    });

    it("searches FollowLyrics with MyMusic identity and formats lyric rows", async () => {
        const get = createGet(async () => ({ data: searchHtml }));
        const { plugin } = createPlugin(get);

        await expect(plugin.search!("周杰伦", 1, "lyric")).resolves.toEqual({
            isEnd: true,
            data: [
                {
                    title: "梦见周杰伦",
                    artist: "黑色牧羊",
                    album: "梦见周杰伦",
                    id: "https://zh.followlyrics.com/lyrics/32342/meng-jian-zhou-jie-lun",
                },
                {
                    title: "你好,周杰伦",
                    artist: "许嵩",
                    album: undefined,
                    id: "https://zh.followlyrics.com/lyrics/116456/ni-hao-zhou-jie-lun",
                },
            ],
        });
        expect(get).toHaveBeenCalledWith(
            "https://zh.followlyrics.com/search",
            expect.objectContaining({
                params: { name: "周杰伦", type: "song" },
                headers: expect.objectContaining({
                    "User-Agent": expect.stringContaining("MyMusic/"),
                }),
            }),
        );
    });

    it("returns no results for non-lyric search types", async () => {
        const { plugin, get } = createPlugin();

        await expect(plugin.search!("周杰伦", 1, "music")).resolves.toEqual({
            isEnd: true,
            data: [],
        });
        expect(get).not.toHaveBeenCalled();
    });

    it("filters malformed and unsafe search rows", async () => {
        const unsafeHtml = `
        <table class="table table-striped"><tbody>
          <tr><td></td><td>artist</td><td>album</td><td><a href="/lyrics/1/missing-title">歌词</a></td></tr>
          <tr><td>Missing href</td><td>artist</td><td>album</td><td><a>歌词</a></td></tr>
          <tr><td>Wrong host</td><td>artist</td><td>album</td><td><a href="https://evil.example/lyrics/1">歌词</a></td></tr>
          <tr><td>Wrong protocol</td><td>artist</td><td>album</td><td><a href="http://zh.followlyrics.com/lyrics/1">歌词</a></td></tr>
          <tr><td>Good row</td><td>artist</td><td>album</td><td><a href="/lyrics/2/good-row">歌词</a></td></tr>
        </tbody></table>`;
        const get = createGet(async () => ({ data: unsafeHtml }));
        const { plugin } = createPlugin(get);

        const result = await plugin.search!("周杰伦", 1, "lyric");

        expect(result.data).toEqual([{
            title: "Good row",
            artist: "artist",
            album: "album",
            id: "https://zh.followlyrics.com/lyrics/2/good-row",
        }]);
    });

    it("fetches lyric details only from safe FollowLyrics HTTPS URLs", async () => {
        const get = createGet(async () => ({
            data: `<div id="lyrics">[00:00.00]第一行
[00:10.00]第二行</div>`,
        }));
        const { plugin } = createPlugin(get);

        await expect(plugin.getLyric!({
            id: "/lyrics/32342/meng-jian-zhou-jie-lun",
            platform: "歌词网",
        })).resolves.toEqual({
            rawLrc: "[00:00.00]第一行[00:10.00]第二行",
        });
        expect(get).toHaveBeenCalledWith(
            "https://zh.followlyrics.com/lyrics/32342/meng-jian-zhou-jie-lun",
            expect.objectContaining({
                headers: expect.objectContaining({
                    "User-Agent": expect.stringContaining("MyMusic/"),
                }),
            }),
        );

        await expect(plugin.getLyric!({
            id: "https://evil.example/lyrics/32342",
            platform: "歌词网",
        })).resolves.toBeNull();
        expect(get).toHaveBeenCalledTimes(1);
    });

    it("preserves provider transport failures", async () => {
        const failure = new Error("provider unavailable");
        const get = createGet(async () => {
            throw failure;
        });
        const { plugin } = createPlugin(get);

        await expect(plugin.search!("周杰伦", 1, "lyric")).rejects.toBe(failure);
    });
});
