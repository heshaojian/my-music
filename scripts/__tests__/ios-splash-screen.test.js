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

describe("iOS splash screen resources", () => {
    it("packages the storyboard required by expo-splash-screen", () => {
        expect(fs.existsSync(storyboardPath)).toBe(true);

        const project = fs.readFileSync(projectPath, "utf8");
        expect(project).toContain("SplashScreen.storyboard in Resources");
    });
});
