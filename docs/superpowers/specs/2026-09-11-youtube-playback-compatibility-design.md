# YouTube Playback Compatibility

## Context

The installed YouTube plugin (`0.0.1`) can search for music, but its playback
request uses the obsolete `ANDROID_MUSIC` client without first establishing an
anonymous YouTube session. YouTube now returns `LOGIN_REQUIRED` without
`streamingData`. The plugin then reads `result.streamingData.formats`
unconditionally, causing every selected search result to fail.

Live verification on 2026-09-11 reproduced this failure for the current plugin.
An anonymous same-domain session bootstrap followed by a current public player
request returned one direct progressive HTTPS stream for each of four unrelated
public videos. The adaptive audio rows were present but did not contain direct
URLs, so the design must support a progressive MP4 stream that includes an audio
track instead of assuming that a direct audio-only URL is always available.

## Decision

MyMusic will bundle and manage YouTube compatibility plugin version
`0.0.2-mymusic.1`. It will preserve the existing working music search surface and
replace only the playback resolver and its defensive parsing.

Before resolving a video, the plugin will establish a short-lived anonymous
YouTube session, extract the minimum visitor context required for a player
request, and rely on the native same-domain cookie jar. It will not ask the user
to sign in or import account cookies. The player response will be classified
before any nested playback fields are read.

The resolver will prefer a direct audio-only HTTPS format when one exists.
Otherwise it will accept a direct progressive HTTPS format whose metadata shows
that it contains audio. Because current anonymous responses may expose only one
playable progressive format, every requested MyMusic quality may fall back to
that same playable source. The returned result will identify the actual selected
quality when the provider supplies enough information to do so.

## Alternatives Considered

### Official embedded YouTube player

This is the most stable documented integration, but it does not provide a raw
audio source for MyMusic's existing TrackPlayer queue, background audio, or
lock-screen controls. It is not Android/iOS feature parity for this app.

### App-owned `yt-dlp` resolver service

This is more resilient to frequent YouTube protocol changes, but it requires a
separate always-available server and sends playback lookups outside the device.
That infrastructure and privacy cost are unnecessary for the personal-use,
device-first application.

### Keep the upstream plugin unchanged

This preserves upstream ownership but leaves all current search results
unplayable. The upstream plugin also has a remote update URL, so a local manual
fix could be overwritten.

## Components

### Bundled YouTube plugin

A new `youtubePluginSource` managed descriptor will own exact platform
`Youtube`, version `0.0.2-mymusic.1`. It will retain search and
`supportedSearchType: ["music"]`, declare `cacheControl: "no-store"`, and omit
`srcUrl` so an obsolete remote source cannot silently replace the compatibility
build.

The plugin will validate the selected item's video ID before making a player
request. YouTube-specific request construction, session state, response parsing,
format selection, and URL validation will remain inside this plugin. No
YouTube-specific branch will be added to the provider-neutral search UI or
TrackPlayer core.

### Anonymous session initializer

The initializer will fetch the public YouTube homepage over HTTPS, allow the
native client to retain same-domain anonymous cookies, and parse only the visitor
context needed for the player request. It will not execute downloaded JavaScript
or parse unrelated configuration.

The app-owned visitor context will exist only in memory and will be shared by
concurrent resolutions through a single in-flight initialization. A failed
initialization will clear that in-flight state so a later playback can try again.
MyMusic will not add a persistent cookie or session store; native networking may
retain its ordinary anonymous same-domain cookies according to platform policy.

### Player resolver

The resolver will make a bounded-time HTTPS player request using the validated
video ID and current managed client profile. It will inspect
`playabilityStatus` before `streamingData`, copy candidate arrays before sorting,
and consider only rows that contain a direct URL and audio-bearing metadata.

Format selection will be deterministic:

1. Prefer direct audio-only candidates.
2. Otherwise use direct progressive candidates that include audio.
3. Choose the nearest available bitrate for the requested MyMusic quality.
4. If only one playable candidate exists, use it for every quality.
5. Ignore cipher-only and SABR-only rows because this scoped fix will not
   execute YouTube player JavaScript or implement signature deciphering.

### Managed lifecycle and cache policy

The existing atomic managed-plugin lifecycle will install YouTube when absent,
upgrade exact-platform `Youtube` versions older than `0.0.2-mymusic.1`, preserve
newer user-installed versions, reconcile duplicates, and leave case-different or
unrelated providers untouched.

`Youtube` will also be added to the app-level non-persistent media-source policy.
This is defense in depth alongside plugin `no-store`: legacy cached YouTube
sources will be removed, and newly resolved signed URLs will never enter the
media cache.

## Data Flow

1. MyMusic discovers installed plugins during normal bootstrap.
2. Managed-plugin setup atomically installs or upgrades exact-platform
   `Youtube` while preserving the previous usable plugin if staging fails.
3. The user searches with YouTube and selects a result.
4. The plugin validates the video ID and obtains or reuses an in-memory anonymous
   session.
5. The plugin sends the public player request and classifies its status.
6. An authentication or bot-check rejection, or an otherwise successful response
   with unexpectedly missing playback data, invalidates the session and triggers
   exactly one fresh bootstrap and one retry.
7. A classified content restriction does not trigger a session refresh.
8. The plugin validates and selects a direct audio-bearing HTTPS format.
9. TrackPlayer receives the signed URL and only the playback headers it requires;
   neither is persisted.

## Error Handling and Security

- Support public, non-DRM videos only. Do not bypass login, age, region,
  membership, payment, private-video, or rights restrictions.
- Treat homepage text, player JSON, video IDs, format metadata, headers, cookies,
  and URLs as untrusted input.
- Accept only trimmed credential-free HTTPS media URLs whose hostname is exactly
  `googlevideo.com` or ends with `.googlevideo.com`. Reject lookalike hosts,
  whitespace, embedded credentials, malformed URLs, and HTTP.
- Do not execute fetched YouTube JavaScript or process `signatureCipher` values.
- Keep anonymous cookies, visitor context, request headers, signed media URLs,
  and URL query strings out of logs, errors, plugin metadata, and persistent
  storage.
- Use bounded network timeouts and one plugin-owned session refresh. Avoid an
  unbounded retry loop or compounded retries.
- Missing or malformed `streamingData`, an empty candidate set, cipher-only
  responses, and terminal restriction statuses must return no source without
  throwing a property-access error.
- Preserve the existing localized generic playback dialog for restricted,
  removed, private, or otherwise unavailable videos. Provider-specific messages
  are outside this fix because the current plugin contract does not expose a safe
  typed failure code.
- Treat YouTube's anonymous player interface as compatibility-dependent and
  subject to future change. Failure must remain contained to the provider.

## Testing

Implementation will follow RED-GREEN-REFACTOR.

Plugin behavior tests will cover managed identity, search preservation, absence
of `srcUrl`, `no-store`, valid video IDs, anonymous session bootstrap, in-memory
reuse, concurrent single-flight initialization, one-time refresh, bounded retry,
and cleanup after initialization failure.

Response tests will cover direct audio selection, progressive audio-bearing
fallback, deterministic bitrate choice, one-candidate quality fallback,
immutable provider arrays, malformed responses, missing `streamingData`, empty
formats, cipher-only formats, and terminal content restrictions.

Security tests will reject HTTP, credentials, surrounding whitespace, malformed
URLs, unrelated hosts, and hostname lookalikes. They will verify that signed
URLs, visitor context, cookies, response bodies, and request headers do not
appear in logs or persisted state.

Lifecycle tests will cover default registration order, upgrade from installed
`Youtube 0.0.1`, preservation of newer versions, exact-platform isolation,
failure containment, duplicate reconciliation, and removal of legacy YouTube
media-cache entries.

Focused tests must pass first. The full Jest suite must remain at or above its
existing coverage baseline, and new YouTube/session logic must reach at least 80%
statements, branches, functions, and lines. Type checking, linting, diff checks,
the iOS simulator build, and Android debug build must pass.

## Device Validation

Automated checks are not sufficient because the final media URL is consumed by
native TrackPlayer. On the physical iPhone, verify an upgrade from the installed
`Youtube 0.0.1`, confirm there is exactly one enabled YouTube plugin, search and
play at least three unrelated public tracks, replay after restarting the app,
and check pause/resume, next track, background playback, and lock-screen controls.
One unavailable or restricted item must show the generic safe dialog without a
crash. Device logs must not contain signed URLs or session material.

Repeat the core install, search, and playback path on an Android device or
emulator. The work is not complete until audio is heard on the physical iPhone.

## Acceptance Criteria

- YouTube remains visible as a Music search source and returns search results.
- Selecting ordinary public search results starts playback on iOS and Android.
- At least three unrelated public tracks play on the physical iPhone.
- A stale anonymous session refreshes once without user action.
- Restricted, removed, malformed, or currently unsupported results fail safely
  with the existing generic dialog and never crash the app.
- Existing `Youtube 0.0.1` installations upgrade automatically without creating
  duplicates; newer user-installed versions are preserved.
- Search and playback behavior for Bilibili, Audiomack, and other providers is
  unchanged.
- No YouTube signed URL, cookie, visitor context, request/response body, or
  sensitive header is persisted or logged.
