import UDIO_MANAGED_PLUGIN from "../udioPluginSource";

type AxiosMock = jest.Mock & {
    get: jest.Mock;
};

function createPlugin(axiosMock: AxiosMock) {
    const module = { exports: {} } as { exports: IPlugin.IPluginInstance };
    const dependencies: Record<string, unknown> = {
        axios: { default: axiosMock },
    };
    // Mirrors the production plugin sandbox so the managed source is tested intact.
    // eslint-disable-next-line no-new-func
    const pluginFactory = Function(`
        "use strict";
        return function(require, module, exports, console, env, URL) {
            ${UDIO_MANAGED_PLUGIN.source}
        };
    `)();

    pluginFactory(
        (name: string) => dependencies[name],
        module,
        module.exports,
        console,
        { os: "ios" },
        URL,
    );
    return module.exports;
}

function createAxiosMock() {
    const request = jest.fn();
    return Object.assign(request, { get: jest.fn() }) as AxiosMock;
}

const playableRow = {
    id: "track-1",
    artist: "Artist",
    title: "Track",
    image_path: "https://images.example/cover.jpg",
    song_path: "https://storage.googleapis.com/udio-artifacts-c33fe3ba-3ffe-471f-92c8-5dfef90b3ea3/samples/audio.mp3",
    duration: 123,
    lyrics: "lyrics",
};

describe("managed Udio plugin source", () => {
    it("exports a managed identity without a remote updater", () => {
        const plugin = createPlugin(createAxiosMock());

        expect(UDIO_MANAGED_PLUGIN).toMatchObject({
            platform: "udio",
            version: "0.0.2-mymusic.1",
        });
        expect(plugin).toMatchObject({
            platform: "udio",
            version: "0.0.2-mymusic.1",
            cacheControl: "no-store",
            supportedSearchType: ["music"],
        });
        expect(plugin).not.toHaveProperty("srcUrl");
    });

    it("searches with structured JSON and filters unsafe audio rows", async () => {
        const axios = createAxiosMock();
        axios.mockResolvedValue({
            data: {
                data: [
                    playableRow,
                    { ...playableRow, id: "unsafe", song_path: "http://example/audio.mp3" },
                ],
            },
        });
        const plugin = createPlugin(axios);

        await expect(plugin.search!("ambient \"quoted\"", 1, "music"))
            .resolves.toMatchObject({
                isEnd: true,
                data: [{ id: "track-1", title: "Track" }],
            });
        expect(JSON.parse(axios.mock.calls[0][0].data)).toMatchObject({
            searchQuery: { searchTerm: "ambient \"quoted\"" },
            pageParam: 0,
            pageSize: 30,
        });
    });

    it("returns the verified source for every requested quality", async () => {
        const plugin = createPlugin(createAxiosMock());

        for (const quality of ["low", "standard", "high", "super"] as const) {
            await expect(plugin.getMediaSource!(
                { ...playableRow, platform: "udio", url: playableRow.song_path },
                quality,
            )).resolves.toEqual({
                url: playableRow.song_path,
                quality: "standard",
            });
        }
    });

    it("rejects unexpected media hosts and returns embedded lyrics", async () => {
        const plugin = createPlugin(createAxiosMock());

        await expect(plugin.getMediaSource!({
            id: "unsafe",
            platform: "udio",
            url: "https://storage.googleapis.com.evil.test/audio.mp3",
        }, "standard")).resolves.toBeNull();
        await expect(plugin.getLyric!({
            id: "track-1",
            platform: "udio",
            rawLrc: "lyrics",
        })).resolves.toEqual({ rawLrc: "lyrics" });
    });
});
