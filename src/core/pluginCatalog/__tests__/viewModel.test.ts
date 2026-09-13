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
        }], "audio", name => name === "Audiomack")).toEqual([{
            ...entries[0],
            managed: true,
            status: "update",
        }]);
    });

    it("marks a missing bundled provider as managed and repairable", () => {
        const maoerEntry = {
            ...entries[0],
            name: "猫耳FM",
        };

        expect(buildCatalogViewItems(
            [maoerEntry],
            [],
            "",
            name => name === "猫耳FM",
        )).toEqual([{
            ...maoerEntry,
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
