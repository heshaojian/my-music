const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const storyboardPath = path.join(
    repositoryRoot,
    "ios",
    "MusicFree",
    "SplashScreen.storyboard",
);
const projectPath = path.join(
    repositoryRoot,
    "ios",
    "MusicFree.xcodeproj",
    "project.pbxproj",
);
const podfilePath = path.join(repositoryRoot, "ios", "Podfile");

describe("iOS splash screen resources", () => {
    it("packages the storyboard required by expo-splash-screen", () => {
        expect(fs.existsSync(storyboardPath)).toBe(true);

        const project = fs.readFileSync(projectPath, "utf8");
        expect(project).toContain("SplashScreen.storyboard in Resources");
    });

    it("keeps legacy native modules on the stable React Native bridge", () => {
        const podfile = fs.readFileSync(podfilePath, "utf8");

        expect(podfile).toContain("ENV['RCT_NEW_ARCH_ENABLED'] = '0'");
    });
});
