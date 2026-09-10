describe("iOS native-module fallbacks", () => {
    beforeEach(() => {
        jest.resetModules();
        jest.doMock("@/core/appConfig", () => ({
            __esModule: true,
            default: { setConfig: jest.fn() },
        }));
        jest.doMock("@/utils/toast", () => ({
            __esModule: true,
            default: { warn: jest.fn() },
        }));
        jest.doMock("@/utils/log.ts", () => ({ errorLog: jest.fn() }));
        jest.doMock("react-native", () => ({
            Dimensions: {
                get: jest.fn(() => ({ width: 390, height: 844 })),
            },
            NativeModules: {},
            Platform: { OS: "ios" },
        }));
    });

    afterEach(() => {
        jest.dontMock("react-native");
        jest.dontMock("@/core/appConfig");
        jest.dontMock("@/utils/toast");
        jest.dontMock("@/utils/log.ts");
    });

    it("imports lyric utilities safely when the Android module is absent", async () => {
        const lyricUtil = require("@/native/lyricUtil").default;

        await expect(lyricUtil.showStatusBarLyric("hello")).resolves.toBeUndefined();
        await expect(lyricUtil.hideStatusBarLyric()).resolves.toBeUndefined();
        await expect(lyricUtil.setStatusBarLyricText("hello")).resolves.toBeUndefined();
        await expect(lyricUtil.setStatusBarLyricTop(10)).resolves.toBeUndefined();
        await expect(lyricUtil.setStatusBarLyricLeft(10)).resolves.toBeUndefined();
        await expect(lyricUtil.setStatusBarLyricWidth(80)).resolves.toBeUndefined();
        await expect(lyricUtil.setStatusBarLyricFontSize(16)).resolves.toBeUndefined();
        await expect(lyricUtil.setStatusBarLyricAlign(17)).resolves.toBeUndefined();
        await expect(lyricUtil.setStatusBarColors("#fff", null)).resolves.toBeUndefined();
        await expect(lyricUtil.checkSystemAlertPermission()).resolves.toBe(false);
        await expect(lyricUtil.requestSystemAlertPermission()).resolves.toBe(false);
    });

    it("uses React Native dimensions when NativeUtils is absent", async () => {
        const nativeUtils = require("@/native/utils").default;

        expect(nativeUtils.getWindowDimensions()).toEqual({ width: 390, height: 844 });
        await expect(nativeUtils.checkStoragePermission()).resolves.toBe(true);
        expect(() => nativeUtils.requestStoragePermission()).not.toThrow();
        expect(() => nativeUtils.exitApp()).not.toThrow();
    });

    it("reports unavailable metadata support without crashing at import", async () => {
        const mp3Util = require("@/native/mp3Util").default;

        await expect(mp3Util.getBasicMeta("song.mp3")).rejects.toThrow(
            "Media metadata is not available on this platform",
        );
    });

    it("never resolves Android-only native module names on iOS", () => {
        const nativeModules = {};
        ["NativeUtils", "Mp3Util", "LyricUtil"].forEach(moduleName => {
            Object.defineProperty(nativeModules, moduleName, {
                get: () => {
                    throw new Error(`Unexpected iOS native lookup: ${moduleName}`);
                },
            });
        });
        jest.resetModules();
        jest.doMock("react-native", () => ({
            Dimensions: { get: jest.fn(() => ({ width: 390, height: 844 })) },
            NativeModules: nativeModules,
            Platform: { OS: "ios" },
        }));

        expect(() => require("@/native/utils")).not.toThrow();
        expect(() => require("@/native/mp3Util")).not.toThrow();
        expect(() => require("@/native/lyricUtil")).not.toThrow();
    });

    it("fails closed when NativeUtils is absent on Android", async () => {
        jest.resetModules();
        jest.doMock("react-native", () => ({
            Dimensions: { get: jest.fn(() => ({ width: 390, height: 844 })) },
            NativeModules: {},
            Platform: { OS: "android" },
        }));

        const nativeUtils = require("@/native/utils").default;

        await expect(nativeUtils.checkStoragePermission()).resolves.toBe(false);
    });

    it("disables status-bar lyrics after an Android native failure", async () => {
        const showStatusBarLyric = jest.fn(async () => {
            throw new Error("permission denied");
        });
        jest.resetModules();
        jest.doMock("react-native", () => ({
            NativeModules: {
                LyricUtil: {
                    showStatusBarLyric,
                    hideStatusBarLyric: jest.fn(),
                },
            },
            Platform: { OS: "android" },
        }));
        const setConfig = jest.fn();
        jest.doMock("@/core/appConfig", () => ({
            __esModule: true,
            default: { setConfig },
        }));

        const lyricUtil = require("@/native/lyricUtil").default;
        await expect(lyricUtil.showStatusBarLyric("hello")).resolves.toBeUndefined();

        expect(setConfig).toHaveBeenCalledWith("lyric.showStatusBarLyric", false);
    });
});
