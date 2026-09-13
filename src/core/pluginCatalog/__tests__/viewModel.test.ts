import { buildCatalogViewItems } from "@/core/pluginCatalog/viewModel";
import type { CatalogEntry } from "@/core/pluginCatalog/types";

const entries: CatalogEntry[] = [{
    id: "https://plugins.example.com/a.js",
    name: "Audiomack",
    version: "2.0.0",
    url: "https://plugins.example.com/a.js",
    host: "plugins.example.com",
}, {
    id: "https://music.example.net/n.js",
    name: "Navidrome",
    version: "1.0.0",
    url: "https://music.example.net/n.js",
    host: "music.example.net",
}];

describe("plugin catalog view model", () => {
    it("combines local filtering with textual install status", () => {
        expect(buildCatalogViewItems(entries, [{
            name: "Audiomack",
            version: "1.0.0",
        }], "audio")).toEqual([{
            ...entries[0],
            managed: false,
            status: "update",
        }]);
    });

    it("shows a missing bundled provider when the remote catalog is empty", () => {
        expect(buildCatalogViewItems([], [], "", [{
            platform: "猫耳FM",
            version: "0.1.5-mymusic.1",
        }])).toEqual([{
            id: "managed-plugin:猫耳FM",
            name: "猫耳FM",
            version: "0.1.5-mymusic.1",
            url: "managed-plugin:%E7%8C%AB%E8%80%B3FM",
            host: "MyMusic",
            managed: true,
            status: "available",
        }]);
    });

    it("lets a managed recommendation replace a same-name remote row", () => {
        const maoerEntry = {
            ...entries[0],
            name: "猫耳FM",
        };

        expect(buildCatalogViewItems(
            [maoerEntry],
            [],
            "",
            [{ platform: "猫耳FM", version: "0.1.5-mymusic.1" }],
        )).toEqual([{
            id: "managed-plugin:猫耳FM",
            name: "猫耳FM",
            version: "0.1.5-mymusic.1",
            url: "managed-plugin:%E7%8C%AB%E8%80%B3FM",
            host: "MyMusic",
            managed: true,
            status: "available",
        }]);
    });

    it("does not mutate catalog or installed input", () => {
        const installed = [{ name: "Navidrome", version: "1.0.0" }];
        const entriesBefore = JSON.stringify(entries);
        const installedBefore = JSON.stringify(installed);

        buildCatalogViewItems(entries, installed, "");

        expect(JSON.stringify(entries)).toBe(entriesBefore);
        expect(JSON.stringify(installed)).toBe(installedBefore);
    });
});
