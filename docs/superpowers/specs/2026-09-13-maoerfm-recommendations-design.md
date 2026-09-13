# MaoerFM Recommendations Design

## Goal

Make the bundled 猫耳FM plugin appear in MyMusic's Recommended page and support the complete tag → sheet → free track → playable media flow on iOS and Android.

## Root Cause

The Recommended page includes only plugins that export `getRecommendSheetsByTag`. The managed 猫耳FM source omitted the upstream recommendation methods, so installation alone could never make it visible there.

## Design

- Restore `getRecommendSheetTags`, `getRecommendSheetsByTag`, and `getMusicSheetInfo` using fixed `https://www.missevan.com` endpoints.
- Defensively map current API payloads, including pagination nested under `pagination`.
- Validate tag, sheet, and page identifiers before sending request parameters.
- Keep only free tracks where `pay_type` is `0`.
- Do not trust or persist direct URLs returned in sheet details; resolve playback through `getMediaSource`.
- Permit HTTPS media only from `missevan.com`, `*.missevan.com`, `maoercdn.com`, or `*.maoercdn.com`; reject credentials, whitespace, HTTP, and suffix-confusion hosts.
- Bump the managed plugin to `0.1.6-mymusic.1` so existing installations are automatically reconciled.

## Acceptance

- 猫耳FM appears as a source on Recommended.
- Tags and sheets load without crashes on malformed provider data.
- Opening a sheet returns free tracks only.
- At least one recommendation track resolves to reachable HTTPS audio.
- Focused tests, full tests, typecheck, lint, Android build, iOS build, and the exact iPhone flow pass.
