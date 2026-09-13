import * as cheerio from "cheerio";
import CryptoJs from "crypto-js";
import dayjs from "dayjs";
import he from "he";

import BILIBILI_MANAGED_PLUGIN from "../bilibiliPluginSource";

type RuntimePlugin = {
    getTopLists: () => Promise<Array<{ title: string; data: unknown[] }>>;
    getTopListDetail: (item: Record<string, unknown>) => Promise<{
        musicList: unknown[];
    }>;
};

function createPlugin(get: jest.Mock) {
    const module = { exports: {} as RuntimePlugin };
    const dependencies: Record<string, unknown> = {
        axios: {
            default: {
                get,
                post: jest.fn(),
            },
        },
        cheerio,
        "crypto-js": CryptoJs,
        dayjs,
        he,
    };

    // Mirrors the production CommonJS sandbox and evaluates the bundled source intact.
    // eslint-disable-next-line no-new-func
    const factory = Function(`
        "use strict";
        return function(require, module, exports, console, env, URL, process) {
            ${BILIBILI_MANAGED_PLUGIN.source}
        };
    `)();
    factory(
        (name: string) => dependencies[name],
        module,
        module.exports,
        { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
        { os: "ios", locale: "en-US", getUserVariables: () => ({}) },
        URL,
        { env: {} },
    );

    return module.exports;
}

const spiResponse = {
    data: {
        data: {
            b_3: "buvid-three",
            b_4: "buvid-four",
        },
    },
};

describe("managed Bilibili rankings", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("adds the current b_nut session cookie to ranking discovery", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1_725_000_123_456);
        const get = jest.fn(async (url: string) => {
            if (url.endsWith("/finger/spi")) {
                return spiResponse;
            }
            return { data: { code: 0, data: { list: [] } } };
        });
        const plugin = createPlugin(get);

        await plugin.getTopLists();

        expect(get).toHaveBeenCalledWith(
            "https://api.bilibili.com/x/web-interface/popular/series/list",
            expect.objectContaining({
                headers: expect.objectContaining({
                    cookie: "buvid3=buvid-three;buvid4=buvid-four;b_nut=1725000123",
                }),
            }),
        );
    });

    it("uses the official ranking referer and maps a successful data.list", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1_725_000_123_456);
        const providerRows = Object.freeze([
            Object.freeze({
                aid: 42,
                bvid: "BV1test",
                title: "A ranked track",
                owner: Object.freeze({ name: "Artist" }),
                pic: "https://i0.hdslb.com/bfs/archive/test.jpg",
                duration: 180,
                pubdate: 1_700_000_000,
            }),
        ]);
        const get = jest.fn(async (url: string) => {
            if (url.endsWith("/finger/spi")) {
                return spiResponse;
            }
            return { data: { code: 0, data: { list: providerRows } } };
        });
        const plugin = createPlugin(get);
        const item = { id: "ranking/v2?rid=3&type=all", title: "Music" };

        const detail = await plugin.getTopListDetail(item);

        expect(get).toHaveBeenLastCalledWith(
            "https://api.bilibili.com/x/web-interface/ranking/v2?rid=3&type=all",
            expect.objectContaining({
                headers: expect.objectContaining({
                    referer: "https://www.bilibili.com/v/popular/rank/all/",
                    cookie: "buvid3=buvid-three;buvid4=buvid-four;b_nut=1725000123",
                }),
            }),
        );
        expect(detail.musicList).toEqual([
            expect.objectContaining({
                id: "BV1test",
                aid: 42,
                bvid: "BV1test",
                title: "A ranked track",
                artist: "Artist",
            }),
        ]);
        expect(detail.musicList).not.toBe(providerRows);
        expect(providerRows[0]).toEqual(expect.objectContaining({ title: "A ranked track" }));
    });

    it("surfaces Bilibili risk control instead of presenting an empty ranking", async () => {
        const get = jest.fn(async (url: string) => url.endsWith("/finger/spi")
            ? spiResponse
            : { data: { code: -352, message: "-352" } });
        const plugin = createPlugin(get);

        await expect(plugin.getTopListDetail({ id: "ranking/v2?rid=0&type=all" }))
            .rejects.toThrow("Bilibili rankings unavailable (-352)");
    });

    it("keeps the generic referer for non-ranking collections", async () => {
        const get = jest.fn(async (url: string) => url.endsWith("/finger/spi")
            ? spiResponse
            : { data: { code: 0, data: { list: [] } } });
        const plugin = createPlugin(get);

        await plugin.getTopListDetail({ id: "popular/precious?page=1" });

        expect(get).toHaveBeenLastCalledWith(
            "https://api.bilibili.com/x/web-interface/popular/precious?page=1",
            expect.objectContaining({
                headers: expect.objectContaining({
                    referer: "https://www.bilibili.com/",
                }),
            }),
        );
    });

    it("rejects a response without a numeric provider code", async () => {
        const get = jest.fn(async (url: string) => url.endsWith("/finger/spi")
            ? spiResponse
            : { data: { data: { list: [] } } });
        const plugin = createPlugin(get);

        await expect(plugin.getTopListDetail({ id: "ranking/v2?rid=0&type=all" }))
            .rejects.toThrow("Invalid Bilibili ranking response");
    });

    it.each([
        undefined,
        null,
        {},
        { list: null },
        { list: "not-an-array" },
    ])("returns a new empty list for malformed successful payload %#", async data => {
        const get = jest.fn(async (url: string) => url.endsWith("/finger/spi")
            ? spiResponse
            : { data: { code: 0, data } });
        const plugin = createPlugin(get);

        const first = await plugin.getTopListDetail({ id: "ranking/v2?rid=0&type=all" });
        const second = await plugin.getTopListDetail({ id: "ranking/v2?rid=0&type=all" });

        expect(first.musicList).toEqual([]);
        expect(second.musicList).toEqual([]);
        expect(first.musicList).not.toBe(second.musicList);
    });
});
