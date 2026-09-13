# Native Playback Error Recovery Design

## Problem

MyMusic already asks YouTube and then Audiomack for a matching track when a
provider returns no media URL. A URL can still pass provider validation and
fail later inside the native iOS or Android player because it expired, its CDN
became unreachable, or the device rejected the stream. The current
`PlaybackError` handler only shows the unavailable dialog or advances the
queue, so these late failures never use the existing cross-provider recovery.

## Selected approach

Give each source-resolution attempt an in-memory numeric identifier. On the
first native playback error for that attempt, resolve the original track
through the existing deterministic YouTube-to-Audiomack fallback, replace the
native queue source, restore the prior position, and resume playback. Claim the
attempt before any network work so duplicate native error events cannot launch
parallel recovery. A new source-resolution attempt receives a new identifier.

The recovery keeps the original item as the UI, queue, history, and persistence
identity. Alternate-provider signed URLs and headers remain runtime-only. It
uses the existing eight-second deadline, exact title/version matching, HTTPS
and private-host rejection, and current-track cancellation.

## Failure behavior

If the error came from a placeholder track, the current track changed, this
attempt already recovered, or no safe match resolves before the deadline,
MyMusic preserves its existing localized playback-unavailable behavior. A
failed replacement cannot trigger another recovery for the same attempt.

## Verification

- Unit tests cover one-shot claiming, stale-track cancellation, position
  restoration, original-identity persistence, and unsuccessful fallback.
- The opt-in live suite compares the managed list with the current official
  catalog and verifies public search, lyrics, media resolution, and ranged
  media access without logging signed URLs.
- Full Jest, type checking, lint, Android debug, iOS Release, installation, and
  physical-device launch remain release gates.
