# Android and iOS Baseline

**Recorded:** 2026-09-10
**Approved upstream baseline:** `d118b18b3d0c904400f7eea7bf99c0ceec6c1aee`
**Development branch at first capture:** `codex/ios-android-foundation`
**Repository commit at first capture:** `e97bfaa99ffa446d4b5a31c7d8e05c9556fb6461`

This document records reproducible evidence, not expected behavior. A feature that exists in source remains unverified until its automated, simulator, or physical-device check is recorded in `feature-matrix.md`.

The initial commands were run while Phase 0 harness and CocoaPods files were being prepared in the shared working tree. Results that include those uncommitted files are identified below and must be refreshed at the Phase 0 commit. A later signed device-build check used temporary command-line signing overrides; no personal team, device, or signing identifier belongs in project configuration or this document.

## Toolchain snapshot

| Tool | Verified version or state |
| --- | --- |
| macOS | 26.5.2, Apple Silicon (`aarch64`, as reported by Gradle) |
| Node.js | 24.15.0 |
| npm | 11.12.1 |
| React Native | 0.76.5 |
| React | 18.3.1 |
| TypeScript | declared `^5.3.3` |
| Jest | declared `^29.6.3` |
| Xcode | 26.2, build 17C52 |
| iOS SDK/runtime | iPhone Simulator SDK 26.2; one installed iOS 26.2 runtime |
| System Ruby | 2.6.10p210 |
| Bundler | 1.17.2 reported by the login shell; `bundle exec` also encountered Homebrew Ruby 4.0.1 |
| System CocoaPods | 1.16.2 |
| Gradle wrapper | 8.10.2 |
| Android Gradle settings | build tools 35.0.0, compile SDK 35, target SDK 30, minimum SDK 24, NDK 26.1.10909125, Kotlin 1.9.24 |
| Java | OpenJDK 17.0.20.1 installed for Android builds; login-shell default remains OpenJDK 25.0.2 |
| Android SDK | Homebrew command-line tools root with platforms 33/35, build tools 34/35, platform tools, CMake 3.22.1, and NDK 26.1.10909125 |

The repository declares Node.js `>=18` but does not pin a tested Node, Java, Ruby, Bundler, or CocoaPods version. Reproducibility requires pinning compatible versions after successful builds are established.

## Static checks and tests

| Check | Command | Result | First actionable issue |
| --- | --- | --- | --- |
| TypeScript | `npm run typecheck` | **Passed**, exit 0 | No TypeScript diagnostics in the current Phase 0 shared tree. |
| ESLint, read-only | `npm run lint:check` | **Passed with warnings**, exit 0 | 108 inherited warnings and 0 errors. Generated coverage output is excluded. |
| Jest unit tests | `npm run test:unit -- --runInBand` | **Passed**, exit 0 | 5 suites, 18 tests, 0 snapshots. These are new Phase 0 tests, not upstream tests. |
| Jest coverage | `npm run test:coverage -- --runInBand` | **Passed**, exit 0 | The Phase 0 scope reports 81.25% statements/lines, 88.88% functions, and 68.51% branches. Application native adapters and permission boundaries changed in this phase report 100% statements/lines/functions; the build launcher is exercised at its configuration boundary. This is not repository-wide coverage. |
| React Native configuration | `npx react-native config` | **Passed**, exit 0 | Configuration generation completed and discovered the native packages. |

### Upstream automated-test baseline

The pinned upstream tree contains `jest.config.js` with the React Native preset and a `test` script, but no test or spec source files. Therefore upstream has test tooling but **zero discovered upstream tests**. All 14 passing tests above belong to the Phase 0 working tree.

## Android build baseline

Run from the repository root with:

```sh
npm run build:android:debug
```

**Current result: passed.**

- The repository wrapper initially lacked its executable bit; the npm script invokes it through `sh`, and the executable bit is now tracked for normal direct use.
- The initial OpenJDK 25 failure (`Unsupported class file major version 69`) was resolved by installing and explicitly selecting OpenJDK 17.
- A second configuration failure caused by unconditional release-keystore evaluation was fixed so debug builds do not require private release credentials.
- Android SDK 35, build tools, platform tools, CMake, and the required NDK were installed under the Homebrew SDK root.
- `assembleDebug` then completed successfully: 1,137 actionable tasks, with 122 executed and 1,015 up to date on the final incremental pass.

The launcher respects `JAVA_HOME` plus `ANDROID_HOME`/`ANDROID_SDK_ROOT`. On macOS it also discovers Homebrew's OpenJDK 17 and Android command-line tools automatically, so the plain npm command uses the supported toolchain even when the login shell defaults to a newer Java. The build emits inherited dependency deprecation/manifest warnings and a native-library packaging warning, but no build error.

## iOS project and dependency baseline

### Project discovery

`xcodebuild -list -project ios/MyMusic.xcodeproj` succeeds and reports:

- Targets: `MyMusic`, `MyMusicTests`
- Configurations: `Debug`, `Release`
- Shared scheme: `MyMusic`
- iOS deployment target: 15.1
- Fork bundle identifier: `com.heshaojian.FreeMusic`
- No committed development team is present

The current `Info.plist` declares background audio and the `musicfree` URL scheme; plugin/audio document declarations remain to be added.

### CocoaPods readiness

| Check | Result |
| --- | --- |
| `pod --version` | System CocoaPods 1.16.2 is installed. |
| `bundle check` | **Failed:** Bundler cannot satisfy the Gemfile and requests `bundle install`. |
| `bundle exec pod --version` | **Failed:** the active bundle cannot find the declared CocoaPods dependency. |
| Podfile evaluation from repository root | **Failed:** `use_react_native!` could not resolve the React Native package from the Podfile evaluation context. Normal installation must be executed from `ios/` through the pinned bundle. |
| Phase 0 `pod install` from `ios/` | **Passed using the available system CocoaPods:** 99 dependencies and 105 installed pods; the workspace and lockfile were generated. |

**First actionable fix:** make that successful installation reproducible by establishing a repository-local, locked Ruby/Bundler environment compatible with the Gemfile. Commit only `Podfile.lock` and intended project integration files—not generated Pods.

### Simulator build

Attempted without signing:

```sh
xcodebuild -project ios/MyMusic.xcodeproj \
  -scheme MyMusic \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/MyMusicDerivedData \
  CODE_SIGNING_ALLOWED=NO build
```

**Initial result before the completed Pod installation: failed, exit 65.** The first build error was:

```text
Unable to open base configuration reference file
ios/Pods/Target Support Files/Pods-MyMusic/Pods-MyMusic.debug.xcconfig
```

Dependent CocoaPods input/output file lists were also missing. This was a dependency-integration failure before application compilation.

After Pod installation, `xcodebuild -list -workspace ios/MyMusic.xcworkspace` succeeded and exposed `MyMusic` plus the dependency schemes. A Debug simulator build and launch now succeed. The application reaches its home screen and completes storage, configuration, plugin, player, playlist, lyric, local-music, theme, and language initialization without a fatal error.

### Signed physical-device build and install

A Debug workspace build for a connected personal iPhone completed successfully using a temporary command-line developer-team override. A standalone Release build also completed successfully and was installed over the Debug build. The personal team identifier was not written into the Xcode project.

The first tap exposed a native launch crash before React Native rendered. The device crash report showed Expo Splash Screen loading its required `SplashScreen.storyboard`, while the app packaged only `LaunchScreen.storyboard`. The missing resource was added with a regression test.

The next device launch reached React Native but crashed while the bridgeless runtime resolved legacy native modules. iOS now uses the stable bridge, matching Android, and shared adapters no longer access Android-only native modules on iOS. Simulator validation then revealed that a top-level permissions import initialized an unconfigured iOS native package; permissions loading is now Android-only. The signed Release build was rebuilt and installed after these startup fixes. Physical UI and playback still require a final unlocked-device tap.

## Available Apple simulators

The following iOS 26.2 simulators were available at capture time:

- Booted: iPhone 17 Pro; Aiyifan iPhone SE
- Shut down: iPhone 17 Pro Max, iPhone Air, iPhone 17, iPhone 16e, Aiyifan iPhone 14 Pro Max
- Shut down iPads: iPad Pro 13-inch (M5), iPad Pro 11-inch (M5), iPad mini (A17 Pro), iPad (A16), iPad Air 13-inch (M3), iPad Air 11-inch (M3)

A physical iPhone build and installation were completed as described above. Simulator runtime evidence confirms ordinary startup and home-screen rendering, but it cannot verify background audio, route changes, interruption handling, Lock Screen controls, or file-provider behavior. Those remain physical-device checks.

## Known source-level iOS blockers

These are inspection findings, not runtime test results:

1. Track-player options still include Android killed-app behavior in shared bootstrap code.
2. Media metadata now fails safely when the Android module is absent, but iOS local-media import still needs a real metadata adapter or filename-only degradation.
3. The iOS application metadata still lacks supported plugin/audio document declarations.
4. The project has no iOS implementation for arbitrary cross-application lyric overlays; this is an intentional OS limitation, not a missing parity promise.

## Phase 0 exit conditions

Refresh this evidence at the Phase 0 commit. Phase 0 is complete only when:

- typecheck, read-only lint, and the harness tests pass;
- the inherited lint warning count is still documented;
- Android `assembleDebug` reaches `BUILD SUCCESSFUL` under a pinned supported JDK and SDK; **met**
- the locked CocoaPods installation succeeds;
- the Xcode targets and shared scheme are recorded;
- an unsigned simulator build either succeeds or records the next application-level actionable error;
- no generated dependency or build-output directory is accidentally committed.
