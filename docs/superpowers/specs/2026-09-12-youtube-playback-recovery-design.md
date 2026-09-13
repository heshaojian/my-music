# YouTube Playback Recovery Design

## Problem

The bundled YouTube plugin previously used the Android VR client. Live
verification on 2026-09-12 showed that YouTube now restricts that client's
token-free media URLs after their initial bytes. Search and resolution succeed,
but full playback therefore fails.

## Selected approach

-   Use the anonymous VisionOS `1.02` player profile, whose current direct media
    URLs remain range-readable without a GVS proof-of-origin token.
-   Keep strict HTTPS `googlevideo.com` URL validation and no-store handling.
-   Prefer AAC/MP4 audio on iOS because AVFoundation cannot reliably play every
    WebM/Opus variant. Android retains its broader audio codec support.
-   On iOS, materialize validated `googlevideo.com` AAC sources into a temporary
    local file using exact 1 MiB query ranges. Apple AVFoundation receives only
    the completed local file because its open-ended request receives HTTP 403.
-   Require canonical `clen` and `itag` values, cap one source at 64 MiB, verify
    every chunk and the final size, and promote through a unique partial file.
-   Keep temporary paths out of persisted track state and cancel stale
    preparation before replacing the native queue.
-   Bump the managed plugin version to `0.0.3-mymusic.2` so installed copies are
    replaced on the next application bootstrap.
-   Preserve the existing bounded session refresh and terminal failure behavior.

## Data flow

Search continues through the existing YouTube web search request. Playback
bootstraps an anonymous visitor session, requests player metadata with the
pinned VisionOS profile, filters direct formats by platform compatibility,
selects the nearest requested bitrate, and returns only a validated direct
media URL. The shared player passes that source through the iOS preparation
adapter; Android uses it directly.

## Failure handling

Invalid IDs, missing visitor data, unsupported formats, cipher-only entries,
SABR-only responses, unsafe media hosts, and terminal playability statuses
return no source. The app then shows its existing playback-unavailable message.
Incomplete chunks and stale preparations are cleaned up and never reach the
native player. No signed media URL or temporary local path is persisted.

## Verification

-   Unit tests cover the exact client profile, automatic managed upgrade,
    iOS AAC preference, Android codec selection, and unsafe/unsupported formats.
-   A privacy-safe live probe must resolve a public video to an allowed MP4 audio
    URL and receive the exact byte count for bounded requests without logging the
    URL.
-   Run the full unit suite, typecheck, lint, Android build, iOS simulator build,
    and signed iPhone build/install.

## Follow-on plugin goal

After YouTube is restored, every bundled and recommended plugin will be audited
through the same visibility, catalog/search, source-resolution, reachability,
and platform-playback contract. Provider-specific repairs will be planned and
implemented as separate bounded changes so one provider cannot destabilize the
others.
