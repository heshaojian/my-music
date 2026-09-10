const {
    ensureAutolinkingCacheMatchesRoot,
    resolveAndroidToolchain,
} = require("../build-android-debug.cjs");

const allPathsExist = Object.freeze({ existsSync: () => true });

describe("Android build toolchain", () => {
    it("prefers explicit standard environment variables", () => {
        expect(
            resolveAndroidToolchain(
                {
                    JAVA_HOME: "/example/jdk-17",
                    ANDROID_HOME: "/example/android-sdk",
                },
                allPathsExist,
            ),
        ).toEqual({
            javaHome: "/example/jdk-17",
            androidHome: "/example/android-sdk",
        });
    });

    it("accepts ANDROID_SDK_ROOT as the standard fallback", () => {
        expect(
            resolveAndroidToolchain(
                {
                    JAVA_HOME: "/example/jdk-17",
                    ANDROID_SDK_ROOT: "/example/android-sdk",
                },
                allPathsExist,
            ).androidHome,
        ).toBe("/example/android-sdk");
    });

    it("uses platform discovery when environment variables are absent", () => {
        expect(
            resolveAndroidToolchain(
                {},
                {
                    ...allPathsExist,
                    resolveHomebrewJava: () => "/discovered/jdk-17",
                    resolveSdkRoot: () => "/discovered/android-sdk",
                },
            ),
        ).toEqual({
            javaHome: "/discovered/jdk-17",
            androidHome: "/discovered/android-sdk",
        });
    });

    it("fails with a clear message when the selected JDK is missing", () => {
        expect(() =>
            resolveAndroidToolchain(
                {
                    JAVA_HOME: "/missing/jdk-17",
                    ANDROID_HOME: "/example/android-sdk",
                },
                { existsSync: () => false },
            ),
        ).toThrow("JDK 17 was not found at /missing/jdk-17/bin/java");
    });
});

describe("Android autolinking cache", () => {
    it("removes generated autolinking data after the repository moves", () => {
        const removeCache = jest.fn();

        expect(
            ensureAutolinkingCacheMatchesRoot("/current/repo", {
                existsSync: () => true,
                readFileSync: () => JSON.stringify({ root: "/previous/repo" }),
                rmSync: removeCache,
            }),
        ).toBe(true);
        expect(removeCache).toHaveBeenCalledWith(
            "/current/repo/android/build/generated/autolinking",
            { force: true, recursive: true },
        );
    });

    it("keeps generated autolinking data for the current repository", () => {
        const removeCache = jest.fn();

        expect(
            ensureAutolinkingCacheMatchesRoot("/current/repo", {
                existsSync: () => true,
                readFileSync: () => JSON.stringify({ root: "/current/repo" }),
                rmSync: removeCache,
            }),
        ).toBe(false);
        expect(removeCache).not.toHaveBeenCalled();
    });
});
