# Android and iOS Feature Parity Matrix

**Baseline:** 2026-09-10
**Status vocabulary:** `Source only` means implementation was found but behavior has not been executed; `Blocked` means the baseline cannot reach the feature; `Not implemented` means the required platform adapter is absent; `Verified` requires dated evidence.

No user-facing feature is verified at this baseline. Android `assembleDebug`, CocoaPods installation, TypeScript, unit tests, and signed iPhone Debug and standalone Release builds/installations have succeeded; iPhone runtime verification remains blocked until the installed app is launched on an unlocked device.

## Evidence rules

- Record a date, commit, platform/OS, device or simulator, build type, and evidence reference for every verified cell.
- Source inspection can establish that code exists; it cannot establish runtime parity.
- Simulator evidence is acceptable for shared UI, navigation, deterministic data behavior, and ordinary foreground lifecycle.
- Physical-device evidence is mandatory for background audio, Lock Screen/Control Center, interruptions, headphones/Bluetooth, cellular download policy, Files providers, and long-running lifecycle recovery.
- A platform limitation must be represented explicitly in both behavior and UI. It must never be marked as ordinary parity.

## Application shell and discovery

| ID | Capability | Intended parity | Android baseline | iOS baseline | Required acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| APP-01 | Cold launch, bootstrap, splash release | Identical | Debug build passed; runtime not verified | Debug and standalone Release device builds/installations passed; launch blocked by locked phone; Android permission access and absent native modules are guarded on iOS | Debug and release cold launch; failure/degraded bootstrap; splash always released |
| APP-02 | Shared navigation, drawer, safe areas, portrait/landscape | Identical UI with native safe areas | Source only | Not verified | Navigate every route on phone sizes; rotate supported screens; no clipped controls |
| APP-03 | English, Simplified Chinese, Traditional Chinese | Identical | Source only | Not verified | Switch each language, relaunch, inspect truncation and persistence |
| DISC-01 | Search history and multi-plugin search | Identical | Source only | Not verified | Music, album, artist, and playlist queries; pagination; empty/error/partial-provider states |
| DISC-02 | Charts/top lists and chart detail | Identical | Source only | Not verified | Load supported provider, refresh, open detail, play an item |
| DISC-03 | Recommended playlists/tags and plugin playlists | Identical | Source only | Not verified | Load tags and pages; open plugin playlist; pagination and provider failure |
| DISC-04 | Album and artist detail | Identical | Source only | Not verified | Metadata, lists, pagination, navigation, play/add/download actions |
| DISC-05 | Music comments where provider supports them | Identical | Source only | Not verified | Load, paginate, unsupported capability, provider error |

## Plugins

| ID | Capability | Intended parity | Android baseline | iOS baseline | Required acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| PLUG-01 | Install plugin from HTTPS URL/deep link | Identical | Source only | Not verified; URL metadata absent | Valid, invalid, oversized, duplicate, multi-URL and non-HTTPS-policy cases |
| PLUG-02 | Install plugin from local JavaScript file | Native-equivalent picker/import | Source only via link/file paths | Not verified; document declaration absent | Android picker/intent and iOS Files provider; copy into managed storage; cancel/error cases |
| PLUG-03 | Enable, disable, uninstall, uninstall all, and reorder | Identical | Source only | Not verified | State persistence across relaunch; active playback; uninstall confirmation |
| PLUG-04 | Update one/all plugins and automatic update | Identical | Source only | Not verified | Success, no-op, invalid update, downgrade, rollback, offline start |
| PLUG-05 | Plugin subscriptions | Identical | Source only | Not verified | Add/edit/remove subscription; partial failure; duplicates |
| PLUG-06 | User variables and source redirection | Identical | Source only | Not verified | Persistence, validation, secrets redaction, redirected source resolution |
| PLUG-07 | CommonJS execution and declared provider capabilities | Identical protocol | Source only | Not verified | Fixture suite for every method; actual platform identity; thrown/hanging method isolation |
| PLUG-08 | Share/export plugin information | Native-equivalent share sheet | Source only | Not verified | Android chooser and iOS share sheet; cancellation; no credential leakage |
| PLUG-09 | Plugin compatibility and last-known-good recovery | Identical | Not characterized | Not implemented | Existing fixtures/hashes; failed-update rollback; lazy-load recovery |

## Playback and system media behavior

| ID | Capability | Intended parity | Android baseline | iOS baseline | Required acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| PLAY-01 | Resolve and stream a selected track | Identical | Source only | Not verified | Valid source, unavailable source, auth/network/format failures |
| PLAY-02 | Queue add/remove/reorder/clear and current-item restoration | Identical | Source only | Not verified | Immutable queue tests plus foreground/background/relaunch behavior |
| PLAY-03 | Sequential, repeat-one, repeat-all, and shuffle modes | Identical | Source only | Not verified | Deterministic domain tests and UI/device behavior |
| PLAY-04 | Quality selection and fallback order | Identical | Source only | Not verified | Each quality, missing quality, ascending/descending fallback |
| PLAY-05 | Play, pause, seek, next, previous, and progress | Identical | Source only | Not verified | UI controls and system controls; boundary and rapid-command cases |
| PLAY-06 | Playback rate | Identical | Source only | Not verified | Supported rates, persistence, queue transition |
| PLAY-07 | Background playback | Native-equivalent | Source only | Background-audio mode configured; runtime not verified | Physical devices, screen lock, app background, several-minute continuity |
| PLAY-08 | System media metadata and controls | Native-equivalent notification vs Lock Screen/Control Center | Source only | Not verified | Title/artwork/progress; play/pause/seek/next/previous on physical devices |
| PLAY-09 | Audio interruptions | Native-equivalent | Not characterized | Not characterized | Incoming call/alarm/Siri or system interruption; temporary vs permanent recovery |
| PLAY-10 | Headphone/Bluetooth and route changes | Native-equivalent | Not characterized | Not characterized | Unplug, Bluetooth connect/disconnect, speaker route, expected pause/resume |
| PLAY-11 | Killed-app/process lifecycle | Platform-specific documented behavior | Source requests Android continue-on-kill | iOS process termination cannot be controlled | Android swipe-away/restart; iOS OS termination and later state restoration |
| PLAY-12 | Autoplay on app start | Identical setting where enabled | Source only | Not verified | Enabled/disabled relaunch with valid and stale queue |
| PLAY-13 | Stream/cache size and cache cleanup | Native-equivalent storage | Source only | Not verified | Limit enforcement, cleanup during idle/playback, low-storage failure |

## Lyrics

| ID | Capability | Intended parity | Android baseline | iOS baseline | Required acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| LRC-01 | Timed in-app lyrics and no-lyric state | Identical | Source only | Not verified | Plain/timed/malformed/Unicode lyrics; seek synchronization |
| LRC-02 | Search, associate, disassociate, and auto-search lyrics | Identical | Source only | Not verified | Supported/unsupported provider; persistence; failure recovery |
| LRC-03 | Lyric offset, font size, and display preferences | Identical | Source only | Not verified | Negative/positive offset, bounds, relaunch persistence |
| LRC-04 | Cross-application floating lyrics | Documented OS limitation | Source only via Android native overlay | **Unavailable by iOS design** | Android permission/show/update/hide; iOS control hidden with clear explanation |
| LRC-05 | Supported Lock Screen lyric/metadata presentation | Native-equivalent within iOS APIs | Not applicable beyond notification metadata | Not implemented | Verify only supported metadata behavior; do not imply arbitrary live overlay parity |

## Downloads, local media, and metadata

| ID | Capability | Intended parity | Android baseline | iOS baseline | Required acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| DL-01 | Download queue, progress, concurrency, completion, retry | Identical orchestration | Source only | Not verified | Multiple tasks; duplicate; pause/interruption; offline/retry; partial failure |
| DL-02 | Download quality fallback | Identical | Source only | Not verified | Requested quality missing; ascending/descending fallback; UI result |
| DL-03 | Cellular download policy | Native-equivalent network state | Source only | Not verified | Physical devices on Wi-Fi/cellular; allow/deny transition |
| DL-04 | Offline playback and downloaded-file deletion | Native-equivalent storage | Source only | Not verified | Airplane mode playback; delete current/non-current item; missing file |
| DL-05 | Managed download path and user export | Native-equivalent | User-selectable/external behavior present in source | Not implemented for iOS Files/share workflow | Path containment, Files export, overwrite/cancel/error, relaunch |
| LOCAL-01 | Discover/import local audio | Native-equivalent scanner/picker | Source only via scanner/file selector | Not implemented for iOS security-scoped providers | MP3/M4A fixtures; duplicates; batch partial failure; unsupported and oversized files |
| LOCAL-02 | Local library list, sort, play, and remove | Identical | Source only | Not verified | Large list, missing file, metadata fallback, persistence |
| META-01 | Read title, artist, album, duration, artwork, embedded lyrics | Shared contract, native adapters | Source only via Android `Mp3Util` | Not implemented | MP3/M4A, Unicode, missing tags, malformed/unsupported files, large artwork |
| META-02 | Write downloaded media tags | Shared contract where format supports it | Source only via Android `Mp3Util` | Not implemented | Read-after-write, permission failure, unsupported container, no source-file corruption |
| FILE-01 | Filesystem roots, cache/data separation, and cleanup | Native-equivalent sandbox paths | Source only | Source selects Documents globally; not contract-tested | Path normalization/traversal tests; backup/download/cache locations; cleanup containment |
| FILE-02 | Storage permission flow | Native-equivalent | Source only | Incorrect: Android permission constants reached on iOS | Android API 24/30+/current; iOS must not request Android storage permissions |

## Playlists, history, backup, and WebDAV

| ID | Capability | Intended parity | Android baseline | iOS baseline | Required acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| DATA-01 | Favorites and playlist create/edit/delete/order | Identical | Source only | Not verified | CRUD, duplicates, sorting, large lists, relaunch |
| DATA-02 | Add/remove/batch-edit playlist tracks | Identical | Source only | Not verified | Single/batch operations, active queue, immutable state |
| DATA-03 | Import provider song or playlist into local playlist | Identical | Source only | Not verified | Success, duplicates, partial provider failure, cancellation |
| DATA-04 | Playback history and limits | Identical | Source only | Not verified | Ordering, dedupe/limit behavior, clearing, relaunch |
| DATA-05 | Existing MMKV/AsyncStorage data compatibility | Identical schema | Not characterized | Not characterized | Golden fixtures and idempotent migration on both platforms |
| BAK-01 | Create and restore local backup | Native-equivalent picker/export | Source only; unversioned JSON | Not verified | Append/overwrite, validation, recovery snapshot, cancel, corrupted/oversized backup |
| BAK-02 | WebDAV configure, back up, list, and restore | Identical protocol | Source only | Not verified | HTTPS server; auth failure; timeout; interrupted restore; cleartext exception policy |
| BAK-03 | Secure WebDAV credentials and redacted logs/backups | Identical security guarantee | Not implemented; ordinary config must be characterized | Not implemented | Keychain/Keystore read-after-write migration; logs and backups contain no secret/header |
| BAK-04 | Versioned, transactional, rollback-safe restore | Identical | Not implemented | Not implemented | Version 0 migration, unknown version, staged commit failure, idempotence, rollback |

## Settings, appearance, sharing, and lifecycle

| ID | Capability | Intended parity | Android baseline | iOS baseline | Required acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| SET-01 | General playback/plugin/download/lyric settings | Identical where capability exists | Source only | Not verified; Android-only controls currently shared | Every setting persists; unsupported controls hidden/explained |
| SET-02 | Light/dark/custom themes and custom backgrounds | Identical UI with native picker | Source only | Not verified | Theme modes, image choose/remove, contrast, relaunch, rotation |
| SET-03 | Cache sizes and targeted cache clearing | Native-equivalent paths | Source only | Not verified | Music/image/lyric caches, in-use files, failure messages |
| SET-04 | About/version and update check | Platform-specific distribution | Source only | Product decision required for personal iOS distribution | Correct version; safe update link/channel; no Android package flow on iOS |
| SHARE-01 | Share music/plugin/application content | Native-equivalent chooser/share sheet | Source only | Not verified | Cancel/success/error, supported targets, privacy-safe payload |
| LINK-01 | App deep links, plugin links, audio files, and JS files | Native-equivalent URL/document dispatch | Source only | Not configured | Cold/warm launch, valid/malformed/oversized encodings, scheme/host/file validation |
| TIMER-01 | Sleep timer pauses/stops playback | Identical user outcome | Source only | Not verified | Foreground/background expiry, clock change, cancel/reschedule |
| TIMER-02 | Exit app when timer expires | Documented platform-specific behavior | Android behavior present in source | **Unavailable on iOS by design** | Android only; iOS must stop playback without attempting process exit |
| ERR-01 | Actionable startup, plugin, network, file, and playback errors | Identical typed categories | Mostly unstructured source behavior | Not implemented | Error mapping, retry/degraded states, stable IDs, no sensitive values |
| OBS-01 | Privacy-safe diagnostic logging | Identical guarantee | Not audited | Not audited | Secret/path/library-content redaction and crash-path review |

## Summary counts at baseline

| Classification | Count/status |
| --- | --- |
| Verified on Android | 0 |
| Verified on iOS simulator | 0 |
| Verified on physical iPhone | 0 |
| Explicit iOS OS limitations | Cross-application floating lyrics; forced process exit/killed-app continuation |
| Current global blockers | Android JDK/SDK readiness; reproducible locked iOS Ruby/CocoaPods toolchain; unlocked-device runtime launch |

Build/install evidence is not counted as feature verification. On 2026-09-10, the iOS Debug workspace build and device installation succeeded with temporary signing overrides; launch was denied because the phone was locked. The generic simulator workspace build was interrupted during dependency compilation and remains unverified.

Update the counts only from rows containing dated evidence. Do not infer completion from a successful build alone.

## Evidence ledger

This ledger separates automated evidence, runtime evidence, and intentional operating-system limitations. Detailed acceptance scenarios remain in the tables above and in `manual-device-checklist.md`.

| Scope | Automated evidence on 2026-09-10 | Simulator or physical-device evidence | OS limitation |
| --- | --- | --- | --- |
| Build and shell (`APP-01`–`APP-03`) | TypeScript, seven unit tests, iOS CocoaPods install, and signed Debug build passed; Android build stops before project configuration | iPhone install passed; launch denied because the phone was locked. Simulator workspace build was interrupted during dependency compilation | None established for ordinary launch/navigation |
| Discovery and plugins (`DISC-*`, `PLUG-*`) | No feature-level automated evidence | None | None; iOS must use native Files/share/deep-link equivalents |
| Playback (`PLAY-*`) | No feature-level automated evidence | None | iOS cannot promise continued execution after OS process termination |
| Lyrics (`LRC-*`) | iOS fallback unit tests are part of the seven passing Phase 0 tests; no end-to-end lyric evidence | None | Arbitrary cross-application floating lyric overlays are unavailable on iOS |
| Downloads, files, and metadata (`DL-*`, `LOCAL-*`, `META-*`, `FILE-*`) | iOS native-fallback unit tests and TypeScript pass; no device behavior is verified | None | iOS uses sandboxed storage and Files providers rather than Android shared-storage permissions |
| Data and backup (`DATA-*`, `BAK-*`) | No feature-level automated evidence | None | None; platform secure storage adapters are required |
| Settings, links, timers, errors (`SET-*`, `SHARE-*`, `LINK-*`, `TIMER-*`, `ERR-*`, `OBS-*`) | No feature-level automated evidence | None | iOS applications must not programmatically exit when a timer expires |
