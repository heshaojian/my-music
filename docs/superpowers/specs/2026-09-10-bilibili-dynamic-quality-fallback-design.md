# Bilibili Dynamic Audio Quality Fallback

## Context

The Bilibili plugin historically mapped MyMusic's four quality keys to four fixed DASH audio-array indexes. Bilibili now commonly returns only three audio entries. A fixed lookup for `super` can therefore produce no URL and fail playback even though lower-quality audio is available.

The installed Bilibili plugin on John's iPhone is version `0.3.0` and already clamps some indexes, but MyMusic must make the behavior deterministic for both existing and future installations instead of depending on a particular external plugin revision or an in-memory cached copy.

## Decision

MyMusic will apply an exact-platform Bilibili quality compatibility policy at the plugin boundary.

- Requests for `low`, `standard`, and `high` remain unchanged.
- A `super` request first uses the plugin normally.
- If the Bilibili plugin cannot return a usable URL for `super`, MyMusic retries once with `high`.
- The fallback is limited to the exact platform name `bilibili`; no global quality preference changes.
- If both attempts fail, the existing localized playback-unavailable dialog remains the final behavior.

This preserves the user's preferred quality whenever Bilibili still supplies it and avoids forcing every other provider down to a lower quality.

## Alternatives Considered

### Set the global default to high

This is the smallest workaround, but it changes every provider and still fails if the user manually selects `super`. Rejected.

### Depend only on a patched external plugin

Clamping the array index inside the plugin is correct, but existing installations can retain an older plugin and the upstream catalog can change independently of MyMusic. Rejected as the only safeguard; the plugin can still be updated independently.

### Add a Bilibili-specific fallback at the plugin boundary

Recommended. It is small, persistent across installations, does not duplicate Bilibili's API implementation, and remains compatible with old and new plugin versions.

## Components

### Quality fallback policy

A pure helper decides whether a failed provider/quality pair has one safe fallback. It returns a new quality value and never mutates the music item or plugin response.

### Plugin media-source resolution

The plugin wrapper invokes the installed plugin for the requested quality. When the result has no non-empty HTTPS URL or the plugin throws, it consults the policy and performs at most one Bilibili `super` to `high` retry. Existing general retry behavior remains bounded and must not create recursion loops.

### Plugin lifecycle

No user plugin file is overwritten. Because the compatibility behavior belongs to MyMusic's wrapper, it applies after an app update even when the installed Bilibili plugin is unchanged. Newly installed Bilibili plugins receive the same protection.

## Data Flow

1. The player requests the configured quality.
2. The Bilibili plugin resolves its current DASH audio list.
3. A valid source is returned immediately.
4. If `super` has no valid URL, MyMusic retries the same music item as `high` once.
5. The resolved source proceeds through the existing header, cache, and track-player path.
6. If no source is available, MyMusic shows the existing localized error and follows the configured skip behavior.

## Validation and Security

- Treat plugin results as untrusted input.
- Accept only a non-empty HTTPS media URL for this remote fallback.
- Do not log media URLs, query strings, cookies, authorization values, or response bodies.
- Do not persist signed Bilibili URLs or playback headers.
- Do not add login, cookie extraction, DRM handling, or restricted-content access.

## Testing

Following TDD, tests will cover:

- `super` succeeds without a retry when the plugin returns a valid URL.
- Missing `super` URL retries exactly once at `high`.
- A thrown `super` lookup retries exactly once at `high`.
- Missing `high` URL returns no source without looping.
- Non-Bilibili platforms never receive this fallback.
- HTTP, malformed, and credential-bearing fallback URLs are rejected.
- Input music items and plugin results are not mutated.

The focused tests, full Jest suite, type checking, linting, Android build, and signed iOS device build must pass before deployment.

## Acceptance Criteria

- The affected public Bilibili chart track plays on John's iPhone when Bilibili returns three audio qualities.
- Selecting MyMusic's highest quality no longer fails solely because a fourth Bilibili audio entry is absent.
- Other providers retain their existing quality behavior.
- The fix survives app restart and does not require manually editing the plugin after each installation.
