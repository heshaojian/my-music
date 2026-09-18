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
            trust: "official",
            availability: "bundled",
        }])).toEqual([{
            id: "managed-plugin:猫耳FM",
            name: "猫耳FM",
            version: "0.1.5-mymusic.1",
            url: "managed-plugin:%E7%8C%AB%E8%80%B3FM",
            host: "MyMusic",
            managed: true,
            managedTrust: "official",
            managedAvailability: "bundled",
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
            [{
                platform: "猫耳FM",
                version: "0.1.5-mymusic.1",
                trust: "official",
                availability: "bundled",
            }],
        )).toEqual([{
            id: "managed-plugin:猫耳FM",
            name: "猫耳FM",
            version: "0.1.5-mymusic.1",
            url: "managed-plugin:%E7%8C%AB%E8%80%B3FM",
            host: "MyMusic",
            managed: true,
            managedTrust: "official",
            managedAvailability: "bundled",
            status: "available",
        }]);
    });

    it("projects bundled and unavailable community recommendations", () => {
        expect(buildCatalogViewItems([], [], "", [{
            platform: "网易云",
            version: "0.2.4-mymusic.1",
            trust: "community",
            availability: "bundled",
        }, {
            platform: "5sing",
            trust: "community",
            availability: "unavailable",
            reason: "no-safe-source",
        }])).toMatchObject([{
            name: "网易云",
            host: "Community",
            managed: true,
            managedTrust: "community",
            managedAvailability: "bundled",
        }, {
            name: "5sing",
            version: "Unavailable",
            host: "Community",
            managed: true,
            managedTrust: "community",
            managedAvailability: "unavailable",
            status: "unavailable",
        }]);
    });

    it("reserves unavailable managed identities from remote replacement", () => {
        const remote5sing = {
            ...entries[0],
            name: "5sing",
        };

        expect(buildCatalogViewItems(
            [remote5sing],
            [],
            "",
            [{
                platform: "5sing",
                trust: "community",
                availability: "unavailable",
                reason: "no-safe-source",
            }],
        )).toEqual([{
            id: "managed-plugin:5sing",
            name: "5sing",
            version: "Unavailable",
            url: "managed-plugin:5sing",
            host: "Community",
            managed: true,
            managedTrust: "community",
            managedAvailability: "unavailable",
            status: "unavailable",
        }]);
    });

    it("does not mutate catalog or installed input", () => {
        const installed = [{ name: "Navidrome", version: "1.0.0" }];
        const recommendations = [{
            platform: "猫耳FM",
            version: "0.1.5-mymusic.1",
            trust: "official" as const,
            availability: "bundled" as const,
        }];
        const entriesBefore = JSON.stringify(entries);
        const installedBefore = JSON.stringify(installed);
        const recommendationsBefore = JSON.stringify(recommendations);

        buildCatalogViewItems(entries, installed, "", recommendations);

        expect(JSON.stringify(entries)).toBe(entriesBefore);
        expect(JSON.stringify(installed)).toBe(installedBefore);
        expect(JSON.stringify(recommendations)).toBe(recommendationsBefore);
    });
});
