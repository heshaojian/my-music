# Manual Android and iPhone Verification Checklist

Use this checklist after automated tests and platform builds pass. Run it on both a supported Android phone and a physical iPhone unless a row explicitly names one platform. Simulator-only execution does not satisfy physical-device requirements.

## Evidence header

Complete this header for each run and attach logs/screenshots/video outside the repository when they may contain personal data.

- Date/time:
- Commit:
- Build type and version:
- Platform and OS version:
- Device model:
- Installation method:
- Test plugin fixture/version:
- Test media fixture/version:
- Network conditions:
- Evidence location:
- Tester:

Do not record a personal signing team identifier, device UDID, certificate, provisioning profile, WebDAV credential, or plugin secret in this file.

Use `Pass`, `Fail`, `Blocked`, or `Not applicable`. For every failure, record exact steps, expected behavior, actual behavior, and a privacy-safe log reference.

## 1. Installation and application shell

- [ ] Install a release build without Metro or a development server.
- [ ] Cold launch after a fresh install completes without a crash or permanent splash screen.
- [ ] Deny every initially requested permission; the app explains impact and remains usable in degraded mode.
- [ ] Grant the requested permissions from the app or system settings; retry succeeds without reinstalling.
- [ ] Relaunch with existing data; settings, playlists, history, plugins, and queue state are consistent.
- [ ] Navigate every drawer item and screen; Back gestures/buttons return to the expected screen.
- [ ] Rotate through every supported orientation; controls remain reachable and safe areas are correct.
- [ ] Verify compact and large phone layouts, increased text size, dark mode, and screen-reader labels for critical controls.
- [ ] Trigger an expected bootstrap failure; the error names the subsystem and retry or safe degraded operation works.

## 2. Plugins and discovery

- [ ] Install the deterministic fixture plugin from a valid HTTPS URL.
- [ ] Open a valid plugin install deep link from a cold start and a warm app.
- [ ] Reject malformed, non-plugin, oversized, disallowed-scheme, and excessive multi-plugin links with a clear error.
- [ ] Import a local `.js` plugin using Android's picker/intent and iOS Files; cancellation makes no change.
- [ ] Confirm the plugin receives the actual `android` or `ios` platform identity.
- [ ] Disable and re-enable a plugin; its state survives relaunch.
- [ ] Reorder plugins; order survives relaunch and affects search order as designed.
- [ ] Configure user variables; secrets never appear in UI errors, logs, shares, or backups.
- [ ] Configure source redirection and verify the chosen source resolves playback.
- [ ] Update a plugin successfully; an invalid update leaves the last-known-good version working.
- [ ] Attempt a downgrade, duplicate install, and offline update; each outcome is explicit and data remains valid.
- [ ] Add, edit, refresh, and remove a plugin subscription; partial failures do not disable valid plugins.
- [ ] Make one plugin throw and one hang; other plugins and startup remain responsive.
- [ ] Search for music, albums, artists, and playlists across multiple plugins.
- [ ] Exercise pagination, empty results, one-provider failure, slow response, cancellation, and retry.
- [ ] Open charts, recommendations, plugin playlists, album detail, artist detail, and comments where supported.

## 3. Playback and queue

- [ ] Play a search result and verify title, artist, artwork, duration, and progress.
- [ ] Exercise play, pause, seek, next, previous, and rapid repeated commands.
- [ ] Add, remove, reorder, and clear queue items; the current item and next-item behavior remain correct.
- [ ] Verify sequential, repeat-one, repeat-all, and shuffle across queue boundaries.
- [ ] Select every available quality and test configured higher/lower fallback when the preferred source is absent.
- [ ] Change playback rate and move to the next track; verify expected persistence.
- [ ] Simulate source-resolution, authorization, offline, timeout, and unsupported-format failures; each message is actionable.
- [ ] Enable and disable autoplay at launch with both a valid and stale saved queue.
- [ ] Lock the screen for at least five minutes; playback and progress continue as configured.
- [ ] Background the app, use other apps, then return; queue, position, lyrics, and artwork remain synchronized.
- [ ] Use notification controls on Android and Lock Screen/Control Center on iPhone for play, pause, seek, next, and previous.
- [ ] Verify system metadata updates when the track changes and clears when playback is stopped.
- [ ] Trigger a temporary audio interruption and a permanent interruption; verify the documented pause/resume rule.
- [ ] Connect and disconnect wired headphones where available; unexpected loudspeaker playback must not occur.
- [ ] Connect, use, and disconnect Bluetooth audio; route and playback state recover correctly.
- [ ] Switch output routes while playing and while paused.
- [ ] Android: swipe the app away and verify the configured continue/stop behavior and notification cleanup.
- [ ] iPhone: let iOS terminate the process, relaunch, and verify safe state restoration without claiming continued execution.

## 4. Lyrics

- [ ] Verify synchronized in-app lyrics for timed, plain, Unicode, malformed, and missing lyric data.
- [ ] Seek forward/backward and change track; lyric highlighting follows the current position.
- [ ] Search for, associate, replace, and disassociate lyrics; association survives relaunch.
- [ ] Enable automatic lyric search and verify supported, unsupported, offline, and ambiguous-result behavior.
- [ ] Change lyric offset in both directions and verify bounds and persistence.
- [ ] Change lyric font/display settings and verify readability in each theme and orientation.
- [ ] Android: deny overlay permission, then grant it; show, update, and hide floating lyrics without crashing.
- [ ] Android: stop playback and terminate the relevant service; the floating lyric overlay is removed.
- [ ] iPhone: verify the floating-overlay control is absent or disabled with a correct iOS limitation explanation.
- [ ] iPhone: verify only supported Lock Screen/system metadata behavior; do not label it a cross-app floating overlay.

## 5. Downloads and offline playback

- [ ] Queue one download and verify preparing, progress, completion, metadata, and library appearance.
- [ ] Queue multiple downloads beyond the concurrency limit; ordering and progress remain correct.
- [ ] Attempt duplicate downloads and conflicting filenames; no silent overwrite or duplicated state occurs.
- [ ] Test every configured quality and quality fallback direction.
- [ ] Lose network mid-download, relaunch, and retry; partial files are resumed or cleaned according to policy.
- [ ] Fill or restrict storage; the task fails safely with a specific reason and no unrelated file is removed.
- [ ] Deny write/import permission where applicable and recover through the documented permission flow.
- [ ] On physical devices, deny cellular downloads, switch from Wi-Fi to cellular, then explicitly allow cellular downloads.
- [ ] Enter airplane mode and play the completed file from beginning to end.
- [ ] Delete a downloaded track while idle and while it is current; queue and library state remain consistent.
- [ ] Export a downloaded file through Android storage/share and iOS Files/share; cancellation and destination errors are safe.
- [ ] Clear download cache while another track is playing; managed roots are respected.

## 6. Local media and metadata

- [ ] Import MP3 and M4A fixtures from Android storage and at least two iOS Files providers.
- [ ] Cancel a picker; no empty record or temporary file remains.
- [ ] Import a duplicate, unsupported extension, malformed file, oversized file, and mixed valid/invalid batch.
- [ ] Revoke access to the original iOS provider item after import; the managed copy still plays.
- [ ] Verify title, artist, album, duration, artwork, and embedded lyrics for tagged fixtures.
- [ ] Verify Unicode metadata, missing metadata, oversized artwork, and malformed metadata fallbacks.
- [ ] Sort, play, add to playlist, and remove local items; relaunch and repeat playback.
- [ ] Move/delete a source file outside the app; the stale library entry fails safely and can be cleaned up.
- [ ] Where tag writing is supported, read after write and confirm the original remains recoverable after failure.

## 7. Playlists and history

- [ ] Create, rename, reorder, and delete a playlist; cancellation and duplicate naming are handled.
- [ ] Add one track, add a batch, remove one, and batch-edit tracks without mutating unrelated playlists.
- [ ] Favorite and unfavorite online and local tracks; state survives relaunch.
- [ ] Import a provider track and playlist, including duplicates and a partial provider failure.
- [ ] Verify playlist ordering with enough items to scroll and after an app restart.
- [ ] Play several tracks and verify history order, deduplication/limit behavior, navigation, and clearing.
- [ ] Upgrade from a fixture containing legacy MMKV/AsyncStorage data; migration is idempotent and preserves content.
- [ ] Interrupt the app during a migration fixture; the last valid dataset remains recoverable.

## 8. Local backup and WebDAV

- [ ] Create a local backup and inspect that it contains only the documented schema and no credentials.
- [ ] Restore by append and overwrite modes; verify playlists and plugins after relaunch.
- [ ] Cancel restore before commit; current data remains unchanged.
- [ ] Reject malformed JSON, unknown versions, prototype-polluting keys, invalid URLs, and oversized input.
- [ ] Interrupt restore during staging/commit; automatic rollback restores the prior valid state.
- [ ] Repeat the same migration/restore; the result is idempotent with no duplicates.
- [ ] Configure an HTTPS WebDAV endpoint and perform upload, list, download, and restore.
- [ ] Test wrong credentials, revoked credentials, timeout, offline mode, missing remote file, and server error.
- [ ] If a personal cleartext WebDAV exception is supported, verify it is explicit and restricted to the chosen host.
- [ ] Verify WebDAV credentials use platform secure storage and are absent from ordinary settings, logs, backups, and UI diagnostics.
- [ ] Android and iPhone: restore the same compatibility fixture and compare normalized resulting data.

## 9. Settings, themes, cache, links, and sharing

- [ ] Exercise every visible setting; values survive a cold relaunch.
- [ ] Verify Android-only and iOS-only controls are shown only on the applicable platform with an explanation where useful.
- [ ] Switch light, dark, system, and custom themes; verify text/icon contrast and system-bar appearance.
- [ ] Choose, replace, and remove a custom background image; cancellation and revoked source access are safe.
- [ ] Switch all supported languages and inspect settings, errors, dialogs, and long labels.
- [ ] Inspect music, image, and lyric cache sizes; clear each independently and verify playback remains stable.
- [ ] Share supported music/plugin/application content; cancel and verify that secrets and private local paths are absent.
- [ ] Open each registered deep link from a cold and warm state.
- [ ] Open supported audio and `.js` documents from the operating system; reject every unsupported type.
- [ ] Verify malformed/oversized encoded URLs, unexpected hosts, traversal paths, and multiple dispatches are rejected.
- [ ] Verify the displayed application version and the personal update channel appropriate to each platform.

## 10. Sleep timer and lifecycle

- [ ] Start, inspect, cancel, and reschedule a sleep timer.
- [ ] Let it expire in foreground, background, and with the screen locked; playback stops or pauses exactly once.
- [ ] Change the wall clock/time zone while scheduled; behavior follows the documented monotonic/wall-clock rule.
- [ ] Relaunch before and after expiry; stale timers do not terminate new playback unexpectedly.
- [ ] Android: test the optional exit behavior and verify notification/service/overlay cleanup.
- [ ] iPhone: verify expiry never attempts to terminate the app process.
- [ ] Send the app to background during plugin update, download, backup, and local import; each operation resumes, rolls back, or reports interruption safely.
- [ ] Force low-memory/process recreation; persisted state is valid and transient dialogs/tasks do not duplicate.

## 11. Privacy, security, and release smoke test

- [ ] Search the release bundle and repository diff for API keys, passwords, tokens, signing identities, certificates, and provisioning profiles.
- [ ] Inspect logs after plugin, WebDAV, link, file, and playback failures; credentials, auth headers, personal library contents, and private paths are redacted.
- [ ] Confirm plugin, backup, image, lyric, URL, and metadata size/type limits at the actual system boundary.
- [ ] Attempt path traversal and symlink escape against every import, export, download, cache-clear, and restore path.
- [ ] Verify HTTPS defaults and that network-security exceptions are minimal and documented.
- [ ] Install final release builds on clean Android and iPhone devices and repeat cold launch, fixture plugin install, search, playback, background controls, download/offline playback, local import, playlist backup, and restore.
- [ ] Confirm both release builds operate without Metro and retain AGPL/upstream attribution.
- [ ] Update `feature-matrix.md` only with the dated evidence produced by this run.

## Run summary

- Passed:
- Failed:
- Blocked:
- Not applicable:
- Critical/high issues:
- Follow-up owner and issue links:
- Release recommendation: Go / No-go
