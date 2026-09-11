const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

function pngDimensions(relativePath) {
    const bytes = fs.readFileSync(path.join(root, relativePath));
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
    };
}

describe("MyMusic brand identity", () => {
    it("uses MyMusic for every platform-visible application name", () => {
        const appConfig = JSON.parse(read("app.json"));

        expect(appConfig.name).toBe("MusicFree");
        expect(appConfig.displayName).toBe("MyMusic");
        expect(read("ios/MusicFree/Info.plist")).toContain(
            "<key>CFBundleDisplayName</key>\n\t<string>MyMusic</string>",
        );
        expect(read("android/app/src/main/res/values/strings.xml"))
            .toContain('<string name="app_name">MyMusic</string>');
        expect(read("ios/MusicFree/SplashScreen.storyboard"))
            .toContain('text="MyMusic"');
        expect(read("ios/MusicFree/LaunchScreen.storyboard"))
            .toContain('text="MyMusic"');
    });

    it("preserves installation and React Native identifiers", () => {
        expect(read("ios/MusicFree/AppDelegate.mm"))
            .toContain('self.moduleName = @"MusicFree"');
        expect(read("android/app/src/main/java/fun/upup/musicfree/MainActivity.kt"))
            .toContain('getMainComponentName(): String = "MusicFree"');
        expect(read("android/app/build.gradle"))
            .toContain('applicationId "fun.upup.musicfree"');
        expect(read("ios/MusicFree.xcodeproj/project.pbxproj"))
            .toContain("PRODUCT_BUNDLE_IDENTIFIER = com.heshaojian.FreeMusic;");
    });

    it("ships a complete opaque iOS icon set from a 1024px master", () => {
        const iconRoot = "ios/MusicFree/Images.xcassets/AppIcon.appiconset";
        const contents = JSON.parse(read(`${iconRoot}/Contents.json`));
        const expected = new Map([
            ["Icon-20@2x.png", 40],
            ["Icon-20@3x.png", 60],
            ["Icon-29@2x.png", 58],
            ["Icon-29@3x.png", 87],
            ["Icon-40@2x.png", 80],
            ["Icon-40@3x.png", 120],
            ["Icon-60@2x.png", 120],
            ["Icon-60@3x.png", 180],
            ["Icon-1024.png", 1024],
        ]);

        expect(contents.images.map(image => image.filename)).toEqual([
            ...expected.keys(),
        ]);
        expected.forEach((size, filename) => {
            expect(pngDimensions(`${iconRoot}/${filename}`)).toEqual({
                width: size,
                height: size,
            });
        });
    });

    it("ships Android launcher artwork for every density and the store", () => {
        const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
        densities.forEach(density => {
            ["ic_launcher.webp", "ic_launcher_round.webp", "ic_launcher_foreground.webp"]
                .forEach(filename => {
                    const file = path.join(
                        root,
                        `android/app/src/main/res/mipmap-${density}/${filename}`,
                    );
                    const bytes = fs.readFileSync(file);
                    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
                    expect(bytes.length).toBeGreaterThan(1000);
                });
        });
        expect(pngDimensions("android/app/src/main/ic_launcher-playstore.png"))
            .toEqual({ width: 512, height: 512 });
    });
});
