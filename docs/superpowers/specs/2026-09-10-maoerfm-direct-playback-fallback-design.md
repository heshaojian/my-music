# MaoerFM Direct Playback Fallback Design

## Problem

The MaoerFM plugin lists tracks successfully, but its `getMediaSource` resolver now returns FairPlay-protected HLS (`SAMPLE-AES` with `com.apple.streamingkeydelivery`). MyMusic uses React Native Track Player 4.1.1 and has no provider license or FairPlay content-key integration, so those resolved streams cannot play. Playback failures are currently logged and skipped without a useful explanation.

The same MaoerFM album response already includes an HTTPS `.m4a` URL for each free track. The first track in the reported album resolves to an ordinary AAC file that can be read successfully.

## Considered Approaches

1. **Prefer MaoerFM's direct track URL (selected).** For MaoerFM items with a valid HTTPS `.m4a` URL, return that source before calling the plugin's DRM-producing resolver. This is narrow, uses provider-supplied data, works on iOS and Android, and does not bypass DRM.
2. **Generic fallback after any native playback error.** Retry `musicItem.url` whenever a plugin-resolved source fails. This is broader, but native errors are asynchronous and could cause double playback, hide unrelated failures, or select stale URLs for other providers.
3. **Implement FairPlay DRM.** This requires MaoerFM authorization, certificate and license-server access, and a native content-key implementation. MyMusic does not possess those credentials, so this is neither viable nor appropriate.

## Design

Add a small, pure source-selection policy at the plugin-manager boundary. It will recognize only MaoerFM media and only accept a direct fallback when the URL is HTTPS and has an `.m4a`, `.mp3`, or `.aac` pathname. Query strings are allowed, but credentials and non-HTTPS schemes are rejected. The returned object is new and does not mutate the media item.

For eligible MaoerFM tracks, `getMediaSource` returns the direct source before invoking the installed plugin resolver. Other plugins and MaoerFM tracks without a safe direct URL retain their current behavior. This keeps the compatibility fix isolated from the global queue and native player.

When no playable source is available, the existing failure path will show a localized dialog explaining that the provider returned protected or unavailable audio. Automatic next-track behavior remains configurable, but failure will no longer be silent.

## Data Flow

1. User selects a MaoerFM track.
2. Track Player requests a media source from Plugin Manager.
3. The policy validates the provider name and direct URL.
4. If valid, Plugin Manager returns the direct AAC/M4A source.
5. Otherwise, the existing plugin resolver and fallback order run unchanged.
6. If native playback still fails, MyMusic shows an actionable provider-source error.

## Testing

- Unit tests start red and cover accepted MaoerFM HTTPS audio URLs.
- Reject HTTP, credential-bearing, malformed, non-audio, and other-provider URLs.
- Verify the MaoerFM plugin resolver is not called when a safe direct source exists.
- Verify normal resolver behavior remains unchanged for other cases.
- Verify the playback failure dialog is localized and does not expose signed URLs.
- Run the full Jest suite with at least 80% coverage, type checking, lint, Android build, signed iOS build, and an on-device launch check.

## Non-Goals

- Circumventing DRM or reverse-engineering provider keys.
- Adding provider login or paid-content support.
- Changing playback behavior for unrelated plugins.
- Persisting or logging signed media URLs.
