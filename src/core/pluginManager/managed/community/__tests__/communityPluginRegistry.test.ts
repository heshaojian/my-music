import {
    COMMUNITY_MANAGED_PLUGINS,
    UNAVAILABLE_COMMUNITY_RECOMMENDATIONS,
} from "../communityPluginRegistry";

describe("community plugin registry", () => {
    it("registers only live-validated executable providers", () => {
        expect(COMMUNITY_MANAGED_PLUGINS.map(item => item.platform)).toEqual([
            "网易云",
            "酷我",
        ]);
        expect(Object.isFrozen(COMMUNITY_MANAGED_PLUGINS)).toBe(true);
    });

    it("keeps every rejected provider recommendation-only", () => {
        expect(UNAVAILABLE_COMMUNITY_RECOMMENDATIONS.map(item => item.platform))
            .toEqual([
                "QQ音乐",
                "咪咕",
                "喜马拉雅",
                "5sing",
                "酷狗",
                "汽水音乐",
            ]);
        expect(UNAVAILABLE_COMMUNITY_RECOMMENDATIONS).toEqual(
            UNAVAILABLE_COMMUNITY_RECOMMENDATIONS.map(item => ({
                platform: item.platform,
                trust: "community",
                availability: "unavailable",
                reason: "no-safe-source",
            })),
        );
        expect(UNAVAILABLE_COMMUNITY_RECOMMENDATIONS.every(Object.isFrozen))
            .toBe(true);
    });
});
