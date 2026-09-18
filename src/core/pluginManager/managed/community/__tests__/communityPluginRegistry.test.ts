import {
    COMMUNITY_MANAGED_PLUGINS,
    UNAVAILABLE_COMMUNITY_RECOMMENDATIONS,
} from "../communityPluginRegistry";

describe("community plugin registry", () => {
    it("registers five audited executable providers in deterministic order", () => {
        expect(COMMUNITY_MANAGED_PLUGINS.map(item => item.platform)).toEqual([
            "网易云",
            "QQ音乐",
            "酷我",
            "咪咕",
            "喜马拉雅",
        ]);
        expect(Object.isFrozen(COMMUNITY_MANAGED_PLUGINS)).toBe(true);
    });

    it("keeps unsafe providers recommendation-only", () => {
        expect(UNAVAILABLE_COMMUNITY_RECOMMENDATIONS).toEqual([
            expect.objectContaining({ platform: "5sing", availability: "unavailable" }),
            expect.objectContaining({ platform: "酷狗", availability: "unavailable" }),
            expect.objectContaining({ platform: "汽水音乐", availability: "unavailable" }),
        ]);
        expect(UNAVAILABLE_COMMUNITY_RECOMMENDATIONS.every(Object.isFrozen))
            .toBe(true);
    });
});
