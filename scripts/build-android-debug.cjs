const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

function resolveAndroidToolchain(environment = process.env, dependencies = {}) {
    const findJavaHome = dependencies.resolveHomebrewJava || resolveHomebrewJava;
    const findAndroidHome = dependencies.resolveSdkRoot || resolveSdkRoot;
    const existsSync = dependencies.existsSync || fs.existsSync;
    const javaHome = environment.JAVA_HOME || findJavaHome();
    const androidHome =
        environment.ANDROID_HOME ||
        environment.ANDROID_SDK_ROOT ||
        findAndroidHome();

    assertExists(path.join(javaHome, "bin", "java"), "JDK 17", existsSync);
    assertExists(
        path.join(androidHome, "platforms", "android-35"),
        "Android SDK 35",
        existsSync,
    );

    return Object.freeze({ javaHome, androidHome });
}

function resolveHomebrewJava() {
    if (process.platform !== "darwin") {
        throw new Error("JAVA_HOME must point to JDK 17");
    }
    const prefix = execFileSync("brew", ["--prefix", "openjdk@17"], {
        encoding: "utf8",
    }).trim();
    return path.join(prefix, "libexec", "openjdk.jdk", "Contents", "Home");
}

function resolveSdkRoot() {
    if (process.platform !== "darwin") {
        throw new Error("ANDROID_HOME must point to an Android SDK containing API 35");
    }
    const sdkManager = execFileSync("/usr/bin/which", ["sdkmanager"], {
        encoding: "utf8",
    }).trim();
    return path.resolve(path.dirname(fs.realpathSync(sdkManager)), "../../..");
}

function assertExists(target, label, existsSync = fs.existsSync) {
    if (!existsSync(target)) {
        throw new Error(`${label} was not found at ${target}`);
    }
}

function ensureAutolinkingCacheMatchesRoot(repositoryRoot, dependencies = fs) {
    const cacheDirectory = path.join(
        repositoryRoot,
        "android",
        "build",
        "generated",
        "autolinking",
    );
    const configPath = path.join(cacheDirectory, "autolinking.json");

    if (!dependencies.existsSync(configPath)) {
        return false;
    }

    let cachedRoot;
    try {
        cachedRoot = JSON.parse(dependencies.readFileSync(configPath, "utf8")).root;
    } catch {
        cachedRoot = undefined;
    }

    if (path.resolve(cachedRoot || "") === path.resolve(repositoryRoot)) {
        return false;
    }

    dependencies.rmSync(cacheDirectory, { force: true, recursive: true });
    return true;
}

function run() {
    const { javaHome, androidHome } = resolveAndroidToolchain();
    const repositoryRoot = path.resolve(__dirname, "..");
    const androidDirectory = path.join(repositoryRoot, "android");
    ensureAutolinkingCacheMatchesRoot(repositoryRoot);
    const result = spawnSync(path.join(androidDirectory, "gradlew"), ["assembleDebug"], {
        cwd: androidDirectory,
        env: {
            ...process.env,
            ANDROID_HOME: androidHome,
            JAVA_HOME: javaHome,
            NODE_ENV: process.env.NODE_ENV || "development",
        },
        stdio: "inherit",
    });

    if (result.error) {
        throw result.error;
    }
    process.exitCode = result.status ?? 1;
}

if (require.main === module) {
    run();
}

module.exports = { ensureAutolinkingCacheMatchesRoot, resolveAndroidToolchain };
