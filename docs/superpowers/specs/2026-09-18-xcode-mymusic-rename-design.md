# Xcode MyMusic Rename Design

## Goal

Make every user-facing and developer-facing Xcode name use `MyMusic` while preserving the existing iOS application identity and repository identity.

## Scope

Rename the following iOS-native surfaces:

- Xcode project: `MusicFree.xcodeproj` to `MyMusic.xcodeproj`
- CocoaPods workspace: `MusicFree.xcworkspace` to `MyMusic.xcworkspace`
- Application target and product: `MusicFree` to `MyMusic`
- Shared scheme: `MusicFreeNew` to `MyMusic`
- Native application source directory: `ios/MusicFree` to `ios/MyMusic`
- Native test target, product, and source directory: `MusicFreeTests` to `MyMusicTests`
- Podfile targets, generated CocoaPods support names, test-host paths, build scripts, and checked-in build commands that reference the renamed Xcode surfaces

## Preserved Identities

The following values remain unchanged:

- Bundle identifier: `com.heshaojian.FreeMusic`
- Git repository and branch names
- React Native package name and JavaScript module behavior unless an Xcode reference requires an update
- Android package/application identifiers
- User data, plugin storage, and upgrade compatibility

Keeping the bundle identifier avoids creating a second iOS application or losing access to the existing app container.

## Migration

The checked-in Xcode project and scheme are renamed first. The Podfile is updated to use `MyMusic` and `MyMusicTests`, then CocoaPods is regenerated so its workspace, support targets, xcconfigs, scripts, and lock integration consistently use the new target names. Stale generated `MusicFree` workspace/support references must not remain in the active build graph.

## Verification

The rename is complete when:

1. `xcodebuild -list` exposes the `MyMusic` scheme and `MyMusic`/`MyMusicTests` targets without legacy app schemes.
2. The iOS simulator build succeeds through `MyMusic.xcworkspace` and the product is `MyMusic.app`.
3. The simulator installs and launches bundle identifier `com.heshaojian.FreeMusic`, displaying `MyMusic`.
4. Type checking, focused plugin tests, Android debug build, and repository diff checks remain green.
5. Existing unrelated working-tree files remain untouched.

## Non-goals

- Changing the bundle identifier
- Renaming the Git repository or top-level checkout
- Renaming Android identifiers
- Changing application behavior or plugin data formats
- Fixing Apple account or provisioning-profile configuration
