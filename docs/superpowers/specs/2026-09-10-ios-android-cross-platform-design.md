# MusicFree Android and iOS Cross-Platform Design

**Date:** 2026-09-10

**Status:** Approved

**Upstream:** `maotoumao/MusicFree`
**Baseline commit:** `d118b18b3d0c904400f7eea7bf99c0ceec6c1aee`

## 1. Objective

Evolve the existing MusicFree React Native application into one maintainable product that supports Android and iOS with full feature parity wherever the operating systems permit equivalent behavior.

The work will preserve the existing React Native screens, plugin protocol, local data, playlists, downloads, settings, and backup compatibility. Android remains continuously usable while iOS becomes a first-class platform.

This project is for personal use and private development. It is not designed for App Store distribution in its current plugin-enabled form.

## 2. Scope

### Included

- One React Native repository and application for Android and iOS.
- Existing Android features and data compatibility.
- Functional iOS application with background playback and system media controls.
- Plugin installation, validation, updates, and execution on both platforms.
- Search, browsing, streaming, quality selection, playlists, history, and lyrics.
- Downloads, local media import, metadata extraction, and artwork.
- WebDAV backup and restore.
- Themes, settings, sleep timer, sharing, deep links, and file handling.
- Explicit platform interfaces and Android/iOS adapters.
- Automated unit, contract, integration, component, and end-to-end tests.

### Excluded

- macOS, Windows, Linux, web, TV, car, and HarmonyOS expansion.
- A SwiftUI rewrite or a new React Native application.
- Public App Store distribution.
- Unrelated redesigns of the existing product interface.
- Changes to the public plugin protocol unless required to correct undefined or unsafe behavior.

## 3. Constraints

- Preserve the AGPL-3.0 license, copyright notices, and upstream attribution.
- Record significant modifications and keep the upstream Git remote available.
- Do not claim that the fork is an official MusicFree release.
- Do not hardcode credentials, plugin secrets, signing identities, or WebDAV credentials.
- Treat plugin code, backup files, imported files, URLs, and remote responses as untrusted inputs.
- Maintain backward compatibility for existing Android plugins and user data.
- Use immutable domain values and state transitions; adapters may encapsulate unavoidable mutable platform APIs.

## 4. Architecture

The application will use a pragmatic modular-monolith form of ports and adapters architecture.

```text
React Native UI and navigation
              |
Application use cases
              |
Platform-neutral domain
              |
Infrastructure interfaces
       |                 |
Android adapters     iOS adapters
```

Dependencies point inward. Platform-neutral modules must not import React Native, MMKV, native modules, navigation, or platform filesystem APIs.

### 4.1 UI and Navigation

Existing pages, components, dialogs, navigation, themes, and localization remain shared by default. Platform-specific `.android` and `.ios` components are introduced only when the user interaction or operating-system capability is materially different.

UI components call application use cases. They do not coordinate native modules, persistence, plugins, or downloads directly.

### 4.2 Application Use Cases

Application services coordinate user-visible operations, including:

- Search and browse music sources.
- Resolve and play a track.
- Manage the queue and playback mode.
- Download or import media.
- Install, update, enable, disable, and remove plugins.
- Create and modify playlists.
- Read and update playback history.
- Back up and restore application data.
- Change settings and themes.

Use cases depend on interfaces, return typed results, and contain no direct platform checks.

### 4.3 Platform-Neutral Domain

The domain owns:

- Music, album, artist, playlist, lyric, plugin, and download models.
- Queue ordering, shuffle, repeat, and quality-selection rules.
- Search result normalization.
- Playlist and playback-history behavior.
- Plugin contracts, capability declarations, and validation.
- Configuration definitions.
- Versioned backup schemas and migration rules.

Domain modules must remain deterministic and independently testable.

### 4.4 Infrastructure Interfaces

The application will define focused interfaces for:

- `AudioPlayer`
- `FileSystem`
- `MediaMetadataReader`
- `DownloadManager`
- `PermissionService`
- `PluginRuntime`
- `SettingsRepository`
- `PlaylistRepository`
- `HistoryRepository`
- `BackupStorage`
- `ShareService`
- `SystemLyricService`

Interfaces will be introduced incrementally around existing managers. The project will not pause for a large rewrite before delivering working iOS capabilities.

### 4.5 Platform Adapters

Android adapters initially wrap existing MusicFree behavior. This establishes contract tests before the existing implementation is refactored.

iOS adapters provide equivalent behavior using iOS-supported APIs. Unsupported system behavior returns an explicit capability result rather than failing at runtime.

Platform selection occurs in one composition root during bootstrap. Shared feature code must not accumulate scattered `Platform.OS` branches.

## 5. Feature Parity

Android is the behavioral reference. A maintained parity matrix will classify each feature as identical, equivalent through native platform behavior, or unavailable because of a documented OS limitation.

| Feature | Shared responsibility | Android adapter | iOS adapter |
| --- | --- | --- | --- |
| Plugins | Protocol, validation, lifecycle | Existing JS runtime | Compatible JS runtime |
| Search and browse | Queries and normalized results | Shared UI | Shared UI |
| Playback | Queue, play modes, quality | Track Player | Track Player and iOS audio session |
| Background audio | Commands and state | Android playback service | iOS background-audio mode |
| System controls | Metadata and actions | Media notification | Lock Screen and Control Center |
| Downloads | Queue, retry, failure policy | Existing storage behavior | App sandbox and Files export |
| Local music | Library and import models | Storage scanner and intents | Document picker and sandbox import |
| Metadata | Normalized metadata contract | Existing native module | iOS native implementation |
| Lyrics | Parsing, timing, associations | In-app and overlay behavior | In-app and supported system metadata |
| Playlists/history | Domain behavior | Repository adapter | Repository adapter |
| Backup/WebDAV | Schema and synchronization | Shared client | Shared client |
| Themes/settings | Models and shared UI | Shared | Shared |
| Sharing/deep links | Parsed actions | Android intents | URL schemes and share sheet |
| Sleep timer | Scheduling rules | Existing behavior | iOS lifecycle-compatible behavior |

iOS cannot provide an arbitrary always-on-top lyric overlay across other applications. The iOS equivalent is synchronized in-app lyrics and supported Lock Screen or system metadata. This limitation must be presented accurately in the interface and parity matrix.

## 6. Plugin Runtime

The existing CommonJS plugin API remains compatible. Plugin execution moves behind `PluginRuntime` so that installation, validation, execution, and future hardening do not leak into search, playback, or download logic.

The runtime must:

- Report the real platform identity.
- Validate plugin metadata and supported protocol version before activation.
- Isolate plugin exceptions from application startup and other plugins.
- Apply timeouts and cancellation to supported asynchronous operations.
- Avoid exposing signing data, stored credentials, unrestricted native modules, or private logs.
- Preserve plugin identity and source metadata across updates.
- Produce actionable, privacy-safe errors.

Because plugins execute code, the user must explicitly choose trusted sources. Personal distribution does not remove the need for basic integrity and isolation controls.

## 7. Data and Compatibility

Existing MusicFree data is the compatibility baseline.

- Current Android plugins work without modification unless they rely on undocumented Android-only behavior.
- Current playlists, history, settings, downloads, and backups remain readable.
- Schema changes include explicit version numbers and tested migrations.
- A backup of current data is created before a destructive migration or restore.
- Platform paths never appear in platform-neutral domain records.
- Backup restore validates structure, version, sizes, and content before replacing current data.
- Interrupted migration or restore leaves the last valid dataset recoverable.

Repositories hide MMKV, AsyncStorage, filesystem layout, and later persistence changes from domain and application code.

## 8. Error Handling and Observability

Infrastructure adapters return typed success or failure results. Expected platform, network, file, plugin, and validation failures must not be represented only by unstructured exceptions.

- Unsupported capabilities are disabled with an explanation.
- One plugin failure cannot crash the application or prevent other plugins from loading.
- Download state remains resumable after network or lifecycle interruption when technically supported.
- Startup identifies the failed subsystem and offers retry or degraded operation when safe.
- Playback errors distinguish source resolution, authorization, connectivity, format, and audio-session failures.
- Logs contain subsystem context and stable error identifiers.
- Logs exclude credentials, authentication headers, personal library contents, and plugin secrets.

## 9. Security

- Validate all external URLs and imported file types at system boundaries.
- Store WebDAV and other credentials using an appropriate secure-storage adapter.
- Require HTTPS by default and make any personal cleartext exception explicit and narrowly scoped.
- Do not interpolate untrusted values into native commands, file paths, or executable code wrappers.
- Normalize and constrain paths to prevent traversal outside application-managed locations.
- Apply size and format limits to plugins, backups, images, lyrics, and media metadata.
- Audit plugin-accessible libraries and capabilities.
- Run dependency and secret scans before release commits.

## 10. Testing Strategy

Development follows test-driven implementation for extracted boundaries and new iOS behavior.

### Unit Tests

Cover domain models and rules, plugin validation, playlist operations, migrations, queue behavior, quality selection, and error mapping.

### Contract Tests

Every Android and iOS adapter must satisfy the same behavioral contract for supported capabilities.

### Integration Tests

Cover plugin installation/execution, repositories, filesystem behavior, download coordination, WebDAV backup/restore, and player orchestration.

### Component Tests

Cover shared React Native screens, platform capability states, errors, retries, and disabled unsupported actions.

### End-to-End Tests

Cover these critical flows:

1. Install plugin, search, select a result, and play.
2. Move playback to the background and use system controls.
3. Download a track and play it offline.
4. Import and play a local media file.
5. Create, edit, back up, and restore playlists.
6. Recover from a plugin, network, download, or audio-session failure.

New and materially changed code targets at least 80 percent automated coverage. Coverage does not replace real-device verification.

## 11. Delivery and Verification

- Android regression tests and a release build pass after every migration phase.
- iOS simulator verifies shared UI, navigation, data, and ordinary lifecycle flows.
- A physical iPhone verifies audio interruptions, headphones, background playback, Lock Screen and Control Center, downloads, Files import, and lifecycle restoration.
- Release builds run without Metro.
- The parity matrix contains evidence for every Android feature.
- No hardcoded secrets, unsafe credential logging, or unvalidated plugin/backup input remains in the changed surface.

## 12. Repository Strategy

- Personal repository: `heshaojian/FreeMusic`, private.
- Development branch: `codex/ios-android-foundation`.
- `origin` points to the personal private repository.
- `upstream` points to `https://github.com/maotoumao/MusicFree.git`.
- The baseline is pinned to commit `d118b18b3d0c904400f7eea7bf99c0ceec6c1aee`.
- Upstream changes are fetched and reviewed deliberately rather than merged from a floating branch automatically.
- Commits follow Conventional Commits.

## 13. Initial Milestones

1. Record the reproducible Android and iOS baseline and establish tests.
2. Introduce the composition root and platform capability model.
3. Extract storage, permissions, and native utility interfaces without Android regressions.
4. Make iOS bootstrap, persistence, navigation, and shared UI stable.
5. Implement iOS audio, background playback, and system controls.
6. Implement iOS files, metadata, downloads, sharing, and deep links.
7. Implement plugin, backup, settings, theme, timer, and lyric parity.
8. Complete security review, full parity verification, and personal release packaging.

## 14. Acceptance Criteria

- One React Native codebase produces working Android and iOS release builds.
- Existing supported Android behavior and data remain compatible.
- Every feature is represented in the parity matrix with verification evidence.
- iOS supports full equivalent behavior except documented OS limitations.
- Core domain modules have no React Native or native-platform imports.
- Android and iOS adapters pass shared contracts.
- Critical end-to-end playback, download, local-file, playlist, and backup flows pass.
- New and materially changed code meets the 80 percent coverage target.
- The private repository preserves the upstream license, attribution, history, and remote.
