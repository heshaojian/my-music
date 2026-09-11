# Bilibili CDN Playback Fallback

## Context

The quality fallback shipped in `ebbf756` does not fix every Bilibili track. Device evidence shows that the Bilibili metadata and play-url requests succeed and return three valid AAC DASH audio entries. The selected primary `mirrorcosov.bilivideo.com` URL can return HTTP 403 to an iOS media request, while the signed Akamai backup URL for the same audio entry returns HTTP 206 and valid MP4 audio bytes. Some tracks already play, so this is a per-source CDN compatibility failure rather than a global Bilibili outage or missing-quality problem.

## Decision

MyMusic will manage a bundled Bilibili compatibility plugin and upgrade the installed Bilibili plugin when the bundled compatibility version is newer.

For each DASH audio entry, the plugin will retain Bilibili's complete signed URL candidates. On iOS it will prefer the first valid HTTPS backup URL, then fall back to the valid primary URL. On Android it will preserve primary-first ordering, then use a backup URL if the primary candidate is unavailable. The existing dynamic audio-quality selection remains unchanged.

The app will not probe or download entire tracks before playback. Selection is deterministic and uses only URL candidates returned for the requested track by Bilibili's play-url response.

## Alternatives Considered

### Always lower audio quality

Rejected because the failing and working candidates can represent the same audio quality. Quality selection is not the failing boundary.

### Reimplement Bilibili inside the app

Rejected for now because it duplicates the external plugin's discovery, search, chart, and import behavior. A narrowly patched, app-managed plugin is easier to update independently.

### Add a local authenticated streaming proxy

Deferred. It would give full control over request headers, but adds native lifecycle, buffering, background-playback, and security complexity that is unnecessary while Bilibili supplies a directly playable backup URL.

## Components

### Bundled compatibility plugin

A versioned JavaScript asset will be derived from the currently installed Bilibili plugin with one focused media-source change: select and return a safe candidate from `backupUrl`/`backup_url` and `baseUrl`/`base_url` according to platform order. The plugin must not log or persist signed URLs.

### Managed-plugin lifecycle

At bootstrap, MyMusic will compare the installed exact-platform `bilibili` plugin with the bundled compatibility version. Missing or older managed versions will be installed atomically through the existing plugin manager. Newer user-installed versions will not be downgraded. Other plugins and similarly named platforms remain untouched.

### Media-source policy

Candidate validation accepts only non-empty HTTPS URLs with no embedded username or password. The returned headers keep the provider's required user agent and referrer without exposing them to durable logs. Signed Bilibili sources remain excluded from MyMusic's media cache.

## Data Flow

1. The player requests a Bilibili track at the configured quality.
2. The managed plugin requests Bilibili's DASH play-url response.
3. It dynamically selects the requested audio entry from the available entries.
4. On iOS it returns the first safe backup URL when present; otherwise it returns the safe primary URL.
5. The existing player receives the URL and headers and starts playback.
6. If the requested quality has no valid candidate, the existing one-step quality fallback remains available.
7. If all candidates fail, MyMusic shows the existing localized playback-unavailable message.

## Error Handling and Security

- Treat the remote plugin payload and every Bilibili URL as untrusted.
- Require HTTPS and reject credentials, whitespace-padded values, malformed URLs, and unsupported schemes.
- Never log full media URLs, query strings, cookies, authorization values, or Bilibili response bodies.
- Do not bypass login, DRM, regional, paid, or account restrictions.
- Keep installation provider-scoped and atomic so an interrupted upgrade retains the previous working plugin.

## Testing

Following TDD, tests will cover candidate normalization, iOS backup-first ordering, Android primary-first ordering, malformed candidate rejection, immutable inputs, managed install/upgrade, no downgrade, exact-platform isolation, and preservation of the existing quality fallback. Full Jest coverage must remain above 80%, and type checking, linting, Android debug build, iOS simulator build, signed iOS release build, install, and launch must pass.

## Acceptance Criteria

- The previously failing Bilibili track plays on John's iPhone using the valid backup CDN candidate.
- Bilibili tracks whose primary source already works continue to play.
- Android and every non-Bilibili provider retain their existing behavior.
- The fix survives reinstall and restart without manual plugin editing.
- No signed media URL or authentication material is persisted or logged.
