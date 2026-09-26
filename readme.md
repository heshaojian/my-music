# MyMusic

Private development fork of [MusicFree](https://github.com/maotoumao/MusicFree), focused on a shared React Native application for Android and iOS.

## Fast iPhone deploy

Use this flow when installing a fresh device build. It keeps Xcode's very large
logs out of the chat/terminal scrollback and only prints the useful result.

1. Reuse local dependencies unless they are missing or stale:

   ```sh
   test -d node_modules || npm ci
   cd ios && pod install && cd ..
   ```

2. Build a Release app for the connected iPhone and save the full log to a file:

   ```sh
   DEVICE_NAME="John's iPhone"
   mkdir -p build/logs
   xcodebuild \
     -workspace ios/MyMusic.xcworkspace \
     -scheme MyMusic \
     -configuration Release \
     -destination "platform=iOS,name=${DEVICE_NAME}" \
     -derivedDataPath build/ios-device \
     CODE_SIGN_STYLE=Automatic \
     -allowProvisioningUpdates \
     -jobs 1 \
     build \
     > build/logs/iphone-release-build.log 2>&1
   ```

   If the build fails, inspect only the end of the log first:

   ```sh
   tail -n 120 build/logs/iphone-release-build.log
   ```

3. Install the built app on the connected iPhone:

   ```sh
   DEVICE_ID="$(xcrun devicectl list devices | awk -v name="$DEVICE_NAME" 'index($0, name) {print $4; exit}')"
   xcrun devicectl device install app \
     --device "$DEVICE_ID" \
     build/ios-device/Build/Products/Release-iphoneos/MyMusic.app
   ```

4. Launch the app:

   ```sh
   xcrun devicectl device process launch \
     --device "$DEVICE_ID" \
     --terminate-existing \
     com.heshaojian.FreeMusic
   ```

Avoid clean builds, dependency reinstalls, or reading the full Xcode log unless
there is a real build failure. Most repeat deploys should be an incremental
quiet build, install, and launch.

## Plugins

Official defaults and community providers that pass current live safety checks
are restored from local, pinned source at startup. Rejected community identities
remain visible for transparency, but cannot be installed, repaired, or executed.
See the
[community plugin provenance](./docs/community-plugin-provenance.md) for source,
license, review, and availability details.

## License

Licensed under the [GNU Affero General Public License v3.0](./LICENSE). The original project, copyright notices, and attribution are retained in accordance with the license.
