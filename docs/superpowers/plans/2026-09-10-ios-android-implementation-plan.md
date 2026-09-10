# MusicFree Android and iOS Implementation Plan

**Date:** 2026-09-10

**Design:** `docs/superpowers/specs/2026-09-10-ios-android-cross-platform-design.md`

**Baseline:** `d118b18b3d0c904400f7eea7bf99c0ceec6c1aee`

## Delivery Rules

- Follow test-driven development: add a failing test, implement the minimum behavior, then refactor.
- Keep Android buildable after every phase.
- Preserve existing storage keys, plugin behavior, and backup compatibility until characterization tests prove a safe migration.
- Keep existing singleton exports as compatibility facades while consumers migrate.
- Do not commit credentials, signing identities, Apple team IDs, certificates, or provisioning profiles.
- Require 80 percent coverage for new and materially changed domain, application, and infrastructure code.
- Record actual simulator or device evidence in the parity matrix; implementation alone is not verification.

## Phase 0: Reproducible Baseline and Test Harness

### 0.1 Add verification scripts and Jest infrastructure

Modify:

- `package.json`
- `jest.config.js`

Add:

- `jest.setup.js`
- `src/test/__tests__/harness.test.ts`
- `src/test/mocks/`

Work:

1. Add `typecheck`, `lint:check`, `test:unit`, `test:coverage`, `build:android:debug`, and `build:ios:simulator` scripts.
2. Add React Native-compatible testing-library dependencies.
3. Write a failing test that imports a module through the `@/` alias.
4. Configure Jest transforms, aliases, cleanup, and deterministic mocks.
5. Make the harness test pass without weakening production types.

Verify:

```sh
npm run typecheck
npm run lint:check
npm run test:unit -- --runInBand
```

### 0.2 Record build and behavioral baselines

Add:

- `docs/parity/baseline.md`
- `docs/parity/feature-matrix.md`
- `docs/parity/manual-device-checklist.md`

Record the inherited lint warnings, absence of upstream tests, Android build result, CocoaPods result, Xcode targets/schemes, and the first actionable iOS build failure if the build is not yet successful.

Commit: `test: establish cross-platform baseline`

## Phase 1: Domain Primitives, Ports, and Composition

### 1.1 Add immutable results and capabilities

Add:

- `src/domain/result.ts`
- `src/domain/errors.ts`
- `src/domain/platformCapabilities.ts`
- associated unit tests

Test typed success/failure values, immutable capability objects, and documented iOS limitations such as system-wide lyric overlays and process termination.

### 1.2 Define focused application ports

Add interfaces under `src/application/ports/` for:

- Audio playback
- Filesystem and paths
- Media metadata
- Downloads
- Permissions
- Plugin execution
- Settings, playlists, and history
- Backup storage
- Sharing
- System lyrics
- Secure credentials

Add reusable adapter contract suites under `src/test/contracts/`. Avoid a single broad platform-service interface.

### 1.3 Introduce one composition root

Add:

- `src/entry/composition/createApplication.ts`
- `src/entry/composition/platformServices.android.ts`
- `src/entry/composition/platformServices.ios.ts`
- `src/entry/composition/types.ts`
- associated tests

Modify `src/entry/bootstrap/bootstrap.ts` and `src/entry/index.tsx` so platform choice happens in the composition root. Shared code must not accumulate scattered platform branches.

Commit: `refactor: add platform ports and composition root`

## Phase 2: Persistence and Secure Credentials

### 2.1 Characterize existing data

Add fixtures and compatibility tests for:

- MMKV database names and keys
- Configuration schema migrations
- Legacy AsyncStorage playlist migration
- Playlist ordering and favorites
- History limits
- Plugin metadata and media caches
- Interrupted and repeated migrations

Run tests against current serialization before replacing any persistence implementation.

### 2.2 Implement repository adapters

Add MMKV-backed settings, playlist, and history repositories plus a legacy AsyncStorage reader. Migrate these files incrementally while keeping their public APIs intact:

- `src/core/appConfig.ts`
- `src/core/musicSheet/storage.ts`
- `src/core/musicSheet/migrate.ts`
- `src/core/musicHistory.ts`
- `src/core/mediaCache.ts`
- `src/core/appMeta.ts`
- `src/core/pluginManager/meta.ts`
- `src/utils/mediaExtra.ts`
- `src/utils/persistStatus.ts`

### 2.3 Protect WebDAV credentials

Add an `expo-secure-store` adapter and a tested migration that writes and verifies secure credentials before deleting the ordinary-storage password. Redact credentials and authorization headers from logs and backups.

Commit: `refactor: isolate persistence and secure credentials`

## Phase 3: Files, Paths, Permissions, and Lifecycle

### 3.1 Add filesystem and path adapters

Add Android and iOS path providers and an RN filesystem adapter. Tests must preserve Android paths, select appropriate iOS Documents/Application Support/Caches locations, normalize file URLs, and reject traversal or cleanup outside managed roots.

### 3.2 Add permission adapters

Replace permission logic in bootstrap and the permission UI with tested Android and iOS services. iOS bootstrap must never reference Android permission constants. Android 30+ and older supported versions retain their current behavior.

### 3.3 Isolate lifecycle behavior

Remove direct `NativeUtils` dependencies from shared code. Android may keep its supported exit behavior; iOS sleep-timer behavior stops playback without terminating the process.

Commit: `refactor: isolate files permissions and lifecycle`

## Phase 4: Stable iOS Application Shell

### 4.1 Repair the iOS project configuration

Modify the Xcode project, scheme, plist, privacy manifest, and Podfile to:

- Use a consistent shared `MusicFree` scheme.
- Replace the example bundle identifier without committing a signing team.
- Enable background audio.
- Register application and plugin-install URL schemes.
- Register supported audio and JavaScript document types.
- Include only required privacy descriptions.
- Keep arbitrary ATS loads disabled.

Add a tested configuration-verification script that asserts these requirements.

### 4.2 Guard optional native modules

Update the native utility, MP3, and lyric wrappers so importing shared screens on iOS cannot crash when an Android-only native module is absent. Unsupported operations return a typed capability failure.

### 4.3 Test Android and iOS bootstrap

Add platform bootstrap integration tests for initialization order, degraded operation, retry behavior, and splash-screen release.

Verify both the Android debug build and unsigned iOS simulator build.

Commit: `feat: establish stable iOS application shell`

## Phase 5: Cross-Platform Playback

### 5.1 Extract immutable queue rules

Move deterministic queue, repeat, shuffle, trimming, and quality-selection logic into tested domain modules. Tests must prove that caller-owned music objects are never mutated.

### 5.2 Wrap React Native Track Player

Add a track-player adapter and application playback service. Keep `src/core/trackPlayer/index.ts` as a compatibility facade while migrating playback, remote commands, source resolution, metadata, progress persistence, and errors.

### 5.3 Deliver iOS background playback

Test and implement:

- Lock Screen and Control Center metadata/actions
- Play, pause, seek, next, and previous
- Temporary and permanent interruption rules
- Headphone and route-change behavior
- Background progress persistence
- Omission of Android-only killed-app options on iOS

Physical iPhone verification is required.

Commit: `feat: add cross-platform background playback`

## Phase 6: Local Media, Metadata, Downloads, and Sharing

### 6.1 Add local-media import use cases

Use platform document pickers behind one contract. On iOS, copy security-scoped selections into managed storage before persisting them. Test cancellation, duplicates, unsupported files, size limits, and partial batch failure.

### 6.2 Implement iOS metadata extraction

Add an AVFoundation native module for duration, title, artist, album, artwork, and embedded lyrics. Test MP3, M4A, Unicode, missing tags, malformed files, and unsupported formats. Wrap the existing Android MP3 module behind the same contract.

### 6.3 Extract and harden downloads

Add immutable download states, an application service, and a filesystem adapter. Test concurrency, duplicates, MIME/extension mismatches, redaction, managed target paths, cleanup, interruption, and iOS Files/share export.

### 6.4 Add sharing and deep-link adapters

Move link parsing out of bootstrap. Validate schemes, hosts, decoded lengths, plugin URL counts, HTTPS policy, file types, and managed paths before dispatch.

Commit: `feat: add cross-platform local media and downloads`

## Phase 7: Compatible Plugin Runtime

### 7.1 Characterize the existing plugin protocol

Add fixtures for search, playback sources, lyrics, albums, artists, playlists, exports, user variables, lazy loading, cache, updates, local files, malformed plugins, thrown methods, and hanging methods.

### 7.2 Implement `PluginRuntime`

Move plugin execution behind a tested runtime that:

- Reports the actual Android or iOS platform.
- Preserves CommonJS behavior and plugin hashes.
- Validates metadata, protocol version, source URLs, capabilities, and variables.
- Enforces plugin size limits.
- Applies supported asynchronous timeouts and cancellation.
- Uses an audited dependency allowlist.
- Isolates method failures and redacts credentials.
- Keeps the last-known-good version when an update fails.

Document accurately that JavaScript `Function` execution is not a security sandbox.

### 7.3 Test install and update flows

Cover URL installation, local document installation, subscriptions, duplicates, downgrades, disabled-state persistence, lazy-load recovery, and failed-update rollback in both platform compositions.

Commit: `refactor: isolate and validate plugin execution`

## Phase 8: Versioned Backup and WebDAV Recovery

### 8.1 Define and validate the backup schema

Add a schema validator and retain the current unversioned backup as version zero. Test unknown versions, structural limits, prototype-polluting keys, invalid URLs, deterministic migrations, and idempotence.

### 8.2 Implement transactional restore

Restore in this order: read, size-check, parse, validate, migrate in memory, create a recovery snapshot, stage changes, commit, and roll back on failure. Test local and WebDAV storage, network failure, plugin failure, interrupted commit, and recovery.

Require HTTPS by default. Any personal cleartext exception must be explicit per host rather than a global ATS relaxation.

Commit: `feat: add safe versioned backup and restore`

## Phase 9: Lyrics, Settings, Themes, and Timer Parity

### 9.1 Isolate system lyrics

Android wraps the current overlay module. iOS explicitly reports that cross-application overlay lyrics are unsupported while retaining synchronized in-app lyrics. Hide Android-only overlay controls on iOS and explain the OS limitation.

### 9.2 Verify settings and themes

Add component tests for language, theme, custom backgrounds, cache clearing, downloads, plugins, backup, capabilities, orientation, and safe areas. Avoid an unrelated visual redesign.

### 9.3 Make sleep timer lifecycle-safe

Extract timer decisions into a deterministic domain module with fake-clock tests. Background expiry must stop or pause playback; iOS must never attempt process termination.

Commit: `feat: complete iOS settings lyrics and timer parity`

## Phase 10: End-to-End Verification and Personal Release

### 10.1 Add native E2E flows

Use Maestro with deterministic local fixture plugins and media for:

- Plugin install, search, and playback
- Background playback and system controls
- Download and offline playback
- Local document import
- Playlist backup and restore
- Error recovery

### 10.2 Enforce quality gates

Run typecheck, non-mutating lint, unit/coverage tests, Android unit and release builds, CocoaPods, iOS simulator tests, and iOS device archives. Enforce 80 percent coverage on new and materially changed modules without failing solely on untouched upstream UI coverage.

### 10.3 Complete security review

Review plugin execution, URL parsing, path traversal, backup limits, credentials, native bridge validation, download redirects and headers, network exceptions, secrets, and dependencies. Fix all critical and high findings before release.

### 10.4 Complete parity evidence

Record automated, simulator, and physical-device evidence for each feature. Verify both Android and iPhone cold launch, plugins, playback, interruptions, headphones/Bluetooth, downloads, local files, metadata, lyrics, playlists, history, backup/WebDAV, themes, settings, timer, links, and lifecycle restoration.

Commit: `test: verify Android and iOS feature parity`

## Dependency Order

```text
Test harness
  -> domain results and capabilities
  -> ports and composition
  -> persistence
  -> filesystem and permissions
  -> stable iOS shell
  -> playback
  -> local files, metadata, and downloads
  -> plugin runtime
  -> backup and WebDAV
  -> lyrics, settings, and timer
  -> E2E, security, and release
```

## Principal Risks

- **Android regressions:** characterize current behavior and run Android build gates in every phase.
- **Data loss:** preserve storage keys, use idempotent migrations, and create recovery snapshots.
- **iOS native gaps:** add guarded adapters before native implementations.
- **Plugin trust:** preserve compatibility without describing dynamic execution as sandboxed.
- **Scope expansion:** migrate one boundary at a time and retain compatibility facades.
- **Build drift:** pin and record compatible Node, Ruby, CocoaPods, Xcode, and Android tooling.
- **Signing leakage:** keep all identities, certificates, profiles, and credentials out of source control.
