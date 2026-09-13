# Bilibili Rankings Reliability Design

## Goal

Restore non-empty Bilibili ranking lists on iOS and Android while preserving the provider's real ranking categories.

## Root Cause

Bilibili's current `ranking/v2` endpoint returns risk-control code `-352` when the request omits the short-lived `b_nut` browser-session cookie or uses a generic Bilibili referer. The managed plugin currently does both, then normalizes the missing response data to an empty list.

## Design

- Keep the existing official Bilibili `ranking/v2` endpoint and category identifiers.
- Extend the anonymous Bilibili cookie with a current Unix-seconds `b_nut` value.
- Use the official ranking page as the referer for ranking requests.
- Validate provider envelopes before mapping rows. A non-zero provider code must throw a clear provider error rather than appear as a valid empty ranking.
- Defensively normalize malformed successful payloads to an empty list without crashing.
- Preserve immutable mapping and the existing safe artwork normalization.
- Bump the bundled managed-plugin version so installed copies are replaced automatically at startup.

## Scope

The change is limited to Bilibili top-list loading and managed-plugin lifecycle assertions. Search, playback, favorites, and unrelated plugins remain unchanged.

## Verification

- Unit tests cover the session cookie, ranking referer, successful mapping, malformed successful data, and `-352` propagation.
- A live test loads the real Bilibili rankings and verifies at least one ranking contains tracks.
- Run the focused Jest suites, typecheck, lint, Android debug build, and signed iOS build.
- Install and launch on the configured iPhone, then verify the upgraded Bilibili plugin source is present in application data.
