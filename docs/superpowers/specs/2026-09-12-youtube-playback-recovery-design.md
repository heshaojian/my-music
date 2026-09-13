# YouTube Playback Recovery Design

## Problem

The bundled YouTube plugin identifies as Android VR client `1.71.26`. Live
verification on 2026-09-12 showed that YouTube returns SABR-only adaptive
formats without direct URLs and a progressive fallback that responds with HTTP
403. Search succeeds, but playback therefore fails.

## Selected approach

- Pin the anonymous Android VR player profile to `1.65.10`, matching the
  currently maintained yt-dlp compatibility profile.
- Keep strict HTTPS `googlevideo.com` URL validation and no-store handling.
- Prefer AAC/MP4 audio on iOS because AVFoundation cannot reliably play every
  WebM/Opus variant. Android retains its broader audio codec support.
- Bump the managed plugin version to `0.0.3-mymusic.1` so installed copies are
  replaced on the next application bootstrap.
- Preserve the existing bounded session refresh and terminal failure behavior.

## Data flow

Search continues through the existing YouTube web search request. Playback
bootstraps an anonymous visitor session, requests player metadata with the
pinned Android VR profile, filters direct formats by platform compatibility,
selects the nearest requested bitrate, and returns only a validated direct
media URL to the shared track-player boundary.

## Failure handling

Invalid IDs, missing visitor data, unsupported formats, cipher-only entries,
SABR-only responses, unsafe media hosts, and terminal playability statuses
return no source. The app then shows its existing playback-unavailable message.
No signed media URL is persisted.

## Verification

- Unit tests cover the exact client profile, automatic managed upgrade,
  iOS AAC preference, Android codec selection, and unsafe/unsupported formats.
- A privacy-safe live probe must resolve a public video to an allowed MP4 audio
  URL and receive HTTP 206 for a small ranged request without logging the URL.
- Run the full unit suite, typecheck, lint, Android build, iOS simulator build,
  and signed iPhone build/install.

## Follow-on plugin goal

After YouTube is restored, every bundled and recommended plugin will be audited
through the same visibility, catalog/search, source-resolution, reachability,
and platform-playback contract. Provider-specific repairs will be planned and
implemented as separate bounded changes so one provider cannot destabilize the
others.
