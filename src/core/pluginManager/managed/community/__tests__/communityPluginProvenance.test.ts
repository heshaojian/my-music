import fs from "fs";
import path from "path";

describe("community plugin provenance", () => {
    it("documents every accepted and unavailable community identity", () => {
        const document = fs.readFileSync(path.resolve(
            __dirname,
            "../../../../../../docs/community-plugin-provenance.md",
        ), "utf8");

        for (const platform of [
            "网易云", "QQ音乐", "酷我", "咪咕", "喜马拉雅", "5sing", "酷狗", "汽水音乐",
        ]) {
            expect(document).toContain(platform);
        }
        expect(document).toContain("e88f5dea5ea7b2b60ccb3aae6823ca38ec71c5d0");
        expect(document).toContain("GPL-3.0");
        expect(document).toContain("private,\npersonal use");
        for (const hash of [
            "d7d2870acbcca6aaaff6e8d16853f1d3db8ff7342cc5a35cebbf79e20eceebce",
            "983ec034fe343b3fba7d08defff2ee0f9f049291d93aa34bcf667b754fd4ca01",
            "aef76a4fe81fa8bea8eda709666eadd6fe99df5137383978719ac5f925310096",
            "45a7d9be59b3fef7e2bc1c7fa2205a12b98776abf560dd5d287acb0b1103659f",
            "ab283d5544c4b40ee53ce9a984c3dcc3bfb39b7c66a443e2497cb6132de4cdce",
        ]) {
            expect(document).toContain(hash);
        }
        expect(document).toContain("failed valid HTTPS certificate checks");
        expect(document).toContain("lacked a distributable license");
        expect(document).toContain("plaintext third-party signing relay");
        expect(document).toContain(
            "live search worked, but no standard HTTPS playback URL",
        );
        expect(document.match(/2026-09-17 live search failed/g)).toHaveLength(2);
        expect(document.match(/not registered for app execution or repairable/g))
            .toHaveLength(3);
    });
});
