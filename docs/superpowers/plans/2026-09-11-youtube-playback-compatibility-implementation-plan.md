# YouTube Playback Compatibility Implementation Plan

## Scope

Implement the approved managed YouTube playback fix without changing the search
UI or TrackPlayer architecture. Preserve the three unrelated untracked duplicate
files in the working tree.

## Phase 1: RED - Managed Identity and Search

1. Add a sandbox test harness for the bundled YouTube source.
2. Require exact managed identity `Youtube` / `0.0.2-mymusic.1`, `no-store`,
   Music search, playback, and no remote `srcUrl`.
3. Reproduce the existing search mapping with representative provider data.
4. Require the default managed registration order to be Bilibili, Audiomack,
   then YouTube.
5. Run the focused tests and retain the expected RED result before implementation.

## Phase 2: GREEN - Anonymous Session and Player Request

1. Add `youtubePluginSource.ts` as readable embedded JavaScript.
2. Preserve the working search behavior.
3. Validate the selected video ID as exactly 11 URL-safe YouTube characters.
4. Bootstrap the public homepage over HTTPS with native same-domain credentials.
5. Parse only bounded, validated `VISITOR_DATA`; never evaluate fetched code.
6. Share one in-flight bootstrap between concurrent playback requests and keep
   visitor context in memory only.
7. Send a bounded player request using the current managed public client profile.
8. Clear failed initialization state so a later playback can retry.

## Phase 3: RED/GREEN - Classification and Bounded Refresh

1. Test missing and malformed `streamingData` without property-access crashes.
2. Test one session refresh for authentication or bot-check rejection.
3. Test one refresh for an otherwise successful response with unexpectedly
   missing playback data.
4. Stop after the second player failure; never loop.
5. Return no source without refreshing for classified private, removed, age,
   region, membership, or other terminal content restrictions.
6. Keep genuine transport failures bounded by the existing wrapper behavior.

## Phase 4: RED/GREEN - Safe Format Selection

1. Copy provider format arrays before filtering or sorting.
2. Accept direct audio-only candidates first.
3. Fall back to direct progressive formats only when metadata proves they include
   audio; reject video-only, cipher-only, and SABR-only rows.
4. Accept only trimmed, credential-free HTTPS URLs on exact `googlevideo.com` or
   a `.googlevideo.com` subdomain.
5. Choose the nearest available bitrate for low, standard, high, and super;
   deterministically break ties by lower bitrate and source order.
6. Use the sole playable candidate for every quality when necessary.
7. Return only the signed URL and minimum required playback user-agent/headers.

## Phase 5: Managed Lifecycle and Cache Policy

1. Register the YouTube descriptor after Audiomack.
2. Verify automatic upgrade from `Youtube 0.0.1`, preservation of newer versions,
   exact-platform isolation, duplicate reconciliation, and rollback behavior using
   the existing lifecycle harness.
3. Add exact `Youtube` to the non-persistent provider media-source policy.
4. Verify legacy YouTube signed sources are removed and similarly named providers
   retain normal cache behavior.

## Phase 6: Security and Privacy Verification

1. Reject HTTP, embedded credentials, whitespace, malformed values, unrelated
   hosts, and hostname lookalikes.
2. Verify session values, cookies, signed URLs, query strings, request/response
   bodies, and sensitive headers are never logged or persisted.
3. Verify no downloaded JavaScript is evaluated and no `signatureCipher` is
   converted into a URL.
4. Require at least 80% statements, branches, functions, and lines for new
   YouTube/session logic.

## Phase 7: Build and Review

1. Run focused Jest tests after every RED/GREEN increment.
2. Run the complete unit suite and coverage.
3. Run TypeScript, read-only lint, and diff checks.
4. Build the iOS simulator target and Android debug APK.
5. Perform correctness and security reviews and resolve all critical/high issues.
6. Inspect every commit so the lint-staged hook cannot sweep in unrelated files.

## Phase 8: Physical Device Acceptance

1. Install the signed build on iPhone `0C14A9B0-7869-53D4-AA1C-9F76765FA3B0`.
2. Confirm the old YouTube plugin upgrades to one enabled managed instance.
3. Search and audibly play three unrelated public tracks.
4. Verify pause/resume, next track, background playback, lock-screen controls,
   and playback after app restart.
5. Confirm an unavailable item shows the generic safe dialog without crashing.
6. Confirm device logs contain no signed URL or anonymous session material.
7. Repeat install, search, and core playback on Android.

## Commit Sequence

1. `test: cover managed YouTube playback compatibility`
2. `feat: add managed YouTube playback resolver`
3. `test: cover YouTube cache and lifecycle policy`
4. `fix: prevent YouTube media source persistence`
5. Final verification amendments only when they contain real tracked changes.
