import { createPluginRuntimeEnvironment } from "@/core/pluginManager/runtimeEnvironment";

describe("plugin runtime environment", () => {
    it("exposes the actual platform and selected locale", () => {
        const getUserVariables = jest.fn(() => ({ token: "value" }));

        const runtime = createPluginRuntimeEnvironment({
            platform: "ios",
            locale: "en-US",
            appVersion: "1.0.0",
            getUserVariables,
        });

        expect(runtime.env.os).toBe("ios");
        expect(runtime.env.lang).toBe("en-US");
        expect(runtime.process.platform).toBe("ios");
        expect(runtime.env.userVariables).toEqual({ token: "value" });
    });

    it("falls back to an empty user-variable object", () => {
        const runtime = createPluginRuntimeEnvironment({
            platform: "android",
            locale: "zh-CN",
            appVersion: "1.0.0",
            getUserVariables: () => null,
        });

        expect(runtime.env.userVariables).toEqual({});
    });
});
