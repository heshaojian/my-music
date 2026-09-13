# YouTube Playback Recovery Implementation Plan

## Scope

Restore YouTube playback without changing search or other providers. Keep the
iOS transport workaround isolated behind the shared player's source-setting
boundary. Continue the broader provider audit after this repair ships.

## TDD sequence

1. Update the YouTube sandbox test helper to inject either iOS or Android.
2. Add failing assertions for managed version `0.0.3-mymusic.2` and VisionOS
   client version `1.02` in the request body, header, and playback user agent.
3. Add failing iOS tests proving AAC/MP4 is preferred, WebM-only audio is
   rejected, and progressive MP4/AAC remains a fallback.
4. Add an Android characterization test proving WebM/Opus remains supported.
5. Add a failing bundled-bootstrap assertion for the new managed version.
6. Run the two focused suites and retain the expected RED result.
7. Pin the client profile, add platform codec filtering before bitrate
   selection, and bump the managed version.
8. Run focused tests and coverage, requiring at least 80% branches and 100%
   statements, functions, and lines for the embedded YouTube source.
9. Add failing tests for exact-host and canonical metadata validation, bounded
   range assembly, cache reuse, corrupt chunks, cleanup, and stale cancellation.
10. Add the iOS-only source preparation adapter and connect it centrally before
    every native queue replacement.
11. Prove Android remains a zero-I/O passthrough and persisted state contains
    neither signed provider URLs nor temporary local paths.

## Verification

-   Full unit suite, typecheck, lint, and diff validation.
-   Privacy-safe live resolution of a public video. Log only MIME family,
    allowlisted-host result, and bounded response status; success requires
    AAC/MP4 and the exact requested byte count.
-   Android debug and iOS simulator builds.
-   Correctness and security review with all critical/high findings resolved.
-   Signed iPhone Release build and install. Launch and inspect the managed
    plugin version when the phone is unlocked; audible playback requires a
    user-initiated play action on the physical device.

## Managed upgrade

The existing atomic lifecycle installs `0.0.3-mymusic.2` over older exact-name
YouTube plugins during bootstrap. Equal or newer valid user plugins remain
untouched, and a failed staged upgrade preserves the prior usable plugin.

## Risks

-   YouTube may later change VisionOS `1.02`; the live ranged request is the
    release gate.
-   Codec filtering must remain iOS-specific so Android does not lose Opus.
-   Signed URLs and session values must never be logged or persisted.
-   The three unrelated duplicate untracked files must remain untouched.
