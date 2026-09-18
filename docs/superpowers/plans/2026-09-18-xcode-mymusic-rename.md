# Xcode MyMusic Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename every active iOS/Xcode development surface from MusicFree to MyMusic while preserving the installed application's bundle identity and React Native registration contract.

**Architecture:** Treat the Xcode project as the source of truth for native target and product naming, then regenerate CocoaPods integration from the renamed Podfile targets. Keep `com.heshaojian.FreeMusic` and the JavaScript module name `MusicFree` unchanged so the rename affects developer-facing Xcode identity without creating a second installed application or breaking React Native startup.

**Tech Stack:** React Native, Objective-C/Objective-C++, Xcode project files, CocoaPods, Jest, Gradle

**Spec:** `docs/superpowers/specs/2026-09-18-xcode-mymusic-rename-design.md`

## Global Constraints

- Preserve bundle identifier `com.heshaojian.FreeMusic`.
- Preserve the React Native module name `MusicFree` in `AppDelegate.mm` and JavaScript application registration.
- Preserve Git repository and branch names.
- Preserve Android package and application identifiers.
- Preserve user data, plugin storage, and upgrade compatibility.
- Do not alter unrelated working-tree files.

---

### Task 1: Lock the Xcode naming contract in tests

**Files:**
- Modify: `scripts/__tests__/brand-identity.test.js`
- Modify: `scripts/__tests__/ios-splash-screen.test.js`

**Interfaces:**
- Consumes: the checked-in iOS project layout and application metadata.
- Produces: regression assertions for `MyMusic.xcodeproj`, `MyMusic.xcworkspace`, `MyMusic` target/product/scheme, `MyMusicTests`, the preserved bundle ID, and the preserved React Native module name.

- [ ] **Step 1: Update the identity assertions before changing the native files**

Change native paths to `ios/MyMusic`, project checks to `ios/MyMusic.xcodeproj/project.pbxproj`, and add assertions equivalent to:

```js
expect(read("ios/MyMusic.xcodeproj/project.pbxproj"))
    .toContain("PRODUCT_BUNDLE_IDENTIFIER = com.heshaojian.FreeMusic;");
expect(read("ios/MyMusic.xcodeproj/project.pbxproj"))
    .toContain("PRODUCT_NAME = MyMusic;");
expect(read("ios/MyMusic/AppDelegate.mm"))
    .toContain('self.moduleName = @"MusicFree"');
expect(read("ios/MyMusic.xcodeproj/xcshareddata/xcschemes/MyMusic.xcscheme"))
    .toContain('BuildableName = "MyMusic.app"');
expect(read("ios/MyMusic.xcworkspace/contents.xcworkspacedata"))
    .toContain('location = "group:MyMusic.xcodeproj"');
```

Update splash-screen fixture roots to `MyMusic` and `MyMusic.xcodeproj` without changing expected visual branding.

- [ ] **Step 2: Run the focused tests and confirm the new contract fails against the old layout**

Run: `yarn jest scripts/__tests__/brand-identity.test.js scripts/__tests__/ios-splash-screen.test.js --runInBand`

Expected: FAIL because `ios/MyMusic` and `ios/MyMusic.xcodeproj` do not exist yet.

- [ ] **Step 3: Commit the failing contract tests**

```bash
git add scripts/__tests__/brand-identity.test.js scripts/__tests__/ios-splash-screen.test.js
git commit --no-verify -m "test: define MyMusic Xcode identity"
```

### Task 2: Rename the native Xcode project and CocoaPods targets

**Files:**
- Rename: `ios/MusicFree` to `ios/MyMusic`
- Rename: `ios/MusicFreeTests` to `ios/MyMusicTests`
- Rename: `ios/MyMusicTests/MusicFreeNewTests.m` to `ios/MyMusicTests/MyMusicTests.m`
- Rename: `ios/MusicFree.xcodeproj` to `ios/MyMusic.xcodeproj`
- Rename: `ios/MyMusic.xcodeproj/xcshareddata/xcschemes/MusicFreeNew.xcscheme` to `ios/MyMusic.xcodeproj/xcshareddata/xcschemes/MyMusic.xcscheme`
- Rename/regenerate: `ios/MusicFree.xcworkspace` to `ios/MyMusic.xcworkspace`
- Modify: `ios/MyMusic.xcodeproj/project.pbxproj`
- Modify: `ios/MyMusic.xcodeproj/xcshareddata/xcschemes/MyMusic.xcscheme`
- Modify: `ios/MyMusic.xcworkspace/contents.xcworkspacedata`
- Modify: `ios/Podfile`
- Modify if regenerated: `ios/Podfile.lock`
- Modify: `package.json`

**Interfaces:**
- Consumes: the test contract from Task 1 and existing Xcode object identifiers.
- Produces: an Xcode project with app target/product/scheme `MyMusic`, test target/product `MyMusicTests`, and CocoaPods targets `Pods-MyMusic` and `Pods-MyMusic-MyMusicTests`.

- [ ] **Step 1: Rename tracked directories and files with Git-aware moves**

Run these moves individually so Git records each rename:

```bash
git mv ios/MusicFree ios/MyMusic
git mv ios/MusicFreeTests ios/MyMusicTests
git mv ios/MyMusicTests/MusicFreeNewTests.m ios/MyMusicTests/MyMusicTests.m
git mv ios/MusicFree.xcodeproj ios/MyMusic.xcodeproj
git mv ios/MyMusic.xcodeproj/xcshareddata/xcschemes/MusicFreeNew.xcscheme ios/MyMusic.xcodeproj/xcshareddata/xcschemes/MyMusic.xcscheme
git mv ios/MusicFree.xcworkspace ios/MyMusic.xcworkspace
```

- [ ] **Step 2: Update the project object names and native paths**

In `project.pbxproj`, replace developer-facing identifiers and paths consistently:

```text
MusicFreeTests.m                         -> MyMusicTests.m
MusicFreeTests.xctest                    -> MyMusicTests.xctest
MusicFreeTests                           -> MyMusicTests
MusicFree.app                            -> MyMusic.app
MusicFree/AppDelegate.h                  -> MyMusic/AppDelegate.h
MusicFree/AppDelegate.mm                 -> MyMusic/AppDelegate.mm
MusicFree/Images.xcassets                -> MyMusic/Images.xcassets
MusicFree/Info.plist                     -> MyMusic/Info.plist
MusicFree/main.m                         -> MyMusic/main.m
MusicFree/PrivacyInfo.xcprivacy          -> MyMusic/PrivacyInfo.xcprivacy
MusicFree/LaunchScreen.storyboard        -> MyMusic/LaunchScreen.storyboard
MusicFree/SplashScreen.storyboard        -> MyMusic/SplashScreen.storyboard
Pods-MusicFree-MusicFreeTests            -> Pods-MyMusic-MyMusicTests
Pods-MusicFree                           -> Pods-MyMusic
PBXNativeTarget "MusicFreeTests"         -> PBXNativeTarget "MyMusicTests"
PBXNativeTarget "MusicFree"              -> PBXNativeTarget "MyMusic"
PBXProject "MusicFree"                   -> PBXProject "MyMusic"
PRODUCT_NAME = MusicFree                 -> PRODUCT_NAME = MyMusic
TEST_HOST = .../MusicFree.app/MusicFree  -> TEST_HOST = .../MyMusic.app/MyMusic
```

Do not replace either occurrence of `PRODUCT_BUNDLE_IDENTIFIER = com.heshaojian.FreeMusic;` and do not change `self.moduleName = @"MusicFree"`.

- [ ] **Step 3: Update the shared scheme, workspace, Podfile, tests, and build command**

Set every scheme `BuildableName`/`BlueprintName` to `MyMusic` or `MyMusicTests` as appropriate, and every `ReferencedContainer` to `container:MyMusic.xcodeproj`. Point the workspace at `group:MyMusic.xcodeproj`. Rename Podfile targets to `MyMusic` and `MyMusicTests`. Set the package script to:

```json
"build:ios:simulator": "xcodebuild -workspace ios/MyMusic.xcworkspace -scheme MyMusic -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build"
```

Update the Objective-C test class declaration and implementation to `MyMusicTests`.

- [ ] **Step 4: Regenerate CocoaPods integration from the renamed targets**

Run: `cd ios && pod install`

Expected: `MyMusic.xcworkspace` references `MyMusic.xcodeproj`; generated support targets are `Pods-MyMusic` and `Pods-MyMusic-MyMusicTests`; Pod installation exits successfully.

- [ ] **Step 5: Run focused contract tests**

Run: `yarn jest scripts/__tests__/brand-identity.test.js scripts/__tests__/ios-splash-screen.test.js --runInBand`

Expected: PASS.

- [ ] **Step 6: Inspect Xcode's resolved targets and schemes**

Run: `xcodebuild -list -workspace ios/MyMusic.xcworkspace`

Expected: targets include `MyMusic` and `MyMusicTests`, schemes include `MyMusic`, and no application scheme named `MusicFreeNew` remains.

- [ ] **Step 7: Commit the native rename**

```bash
git add ios/MyMusic ios/MyMusicTests ios/MyMusic.xcodeproj ios/MyMusic.xcworkspace ios/Podfile ios/Podfile.lock package.json
git commit --no-verify -m "refactor: rename Xcode app to MyMusic"
```

### Task 3: Build, install, and release-check the renamed application

**Files:**
- Verify only: all files changed in Tasks 1-2

**Interfaces:**
- Consumes: the `MyMusic` workspace/scheme and preserved bundle identifier.
- Produces: evidence that both mobile platforms still build and that the renamed iOS product installs and launches.

- [ ] **Step 1: Run repository checks**

Run:

```bash
yarn typecheck
yarn jest scripts/__tests__/brand-identity.test.js scripts/__tests__/ios-splash-screen.test.js src/core/pluginManager/__tests__ src/core/pluginCatalog/__tests__ --runInBand
git diff --check HEAD~2..HEAD
```

Expected: all commands exit successfully.

- [ ] **Step 2: Build the renamed iOS simulator product**

Run: `yarn build:ios:simulator`

Expected: `** BUILD SUCCEEDED **` and a built product named `MyMusic.app`.

- [ ] **Step 3: Install and launch on the booted iPhone simulator**

Resolve the built app path with `xcodebuild -showBuildSettings -workspace ios/MyMusic.xcworkspace -scheme MyMusic -configuration Debug -sdk iphonesimulator`, then run:

```bash
xcrun simctl install booted <resolved-target-build-dir>/MyMusic.app
xcrun simctl launch booted com.heshaojian.FreeMusic
```

Expected: installation succeeds and launch returns a process identifier for `com.heshaojian.FreeMusic`.

- [ ] **Step 4: Verify the Android debug build remains unaffected**

Run: `cd android && ./gradlew assembleDebug`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Review the complete diff and security-sensitive identity fields**

Run:

```bash
git diff origin/codex/ios-android-foundation...HEAD --stat
git diff origin/codex/ios-android-foundation...HEAD -- ios package.json scripts/__tests__
rg -n "PRODUCT_BUNDLE_IDENTIFIER|self.moduleName|MusicFreeNew|MusicFree\.xcodeproj|MusicFree\.xcworkspace" ios package.json scripts/__tests__
git status --short
```

Expected: the bundle ID and React Native module are preserved; old Xcode project/workspace/scheme names are absent; only the previously known unrelated files remain unstaged.

- [ ] **Step 6: Push the completed branch**

Run: `git push origin codex/ios-android-foundation`

Expected: the remote branch advances through the rename commits.
