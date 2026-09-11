# Audiomack Recommendations Compatibility

## Context

The installed Audiomack plugin (`0.0.2`) loads recommendation categories by downloading `https://audiomack.com/playlists` and parsing `script#__NEXT_DATA__`. Audiomack has migrated that page to a newer Next.js delivery format that no longer includes this element. The plugin therefore parses an empty string and throws `Unexpected end of JSON input` before it can show any recommended playlists.

Live verification shows that Audiomack's signed `GET /v1/playlist/categories` API still returns playlist data. The failure is limited to the obsolete category-discovery scrape.

## Decision

MyMusic will bundle and manage Audiomack compatibility plugin version `0.0.3-mymusic.1`. The plugin will stop scraping Audiomack's HTML for recommendation categories and instead return a stable built-in category list whose API slugs were verified against the live signed endpoint:

- What's New (`whats-new`)
- Afrobeats (`afrobeats`)
- Caribbean (`caribbean`)
- Latin (`latin`)
- Pop (`pop`)
- R&B (`rb`)
- Gospel (`gospel`)
- Electronic (`electronic`)
- Rock (`rock`)

Selecting one of these tags will continue to call Audiomack's signed playlist-categories API. A missing or stale tag will normalize to What's New so old navigation state cannot break the page.

## Alternatives Considered

### Parse Audiomack's new page internals

Rejected because the data transport is an implementation detail that can change again without notice. It also couples recommendation loading to a large HTML response.

### Show only What's New

Rejected because it restores loading but removes useful discovery categories that the current API still supports.

### Add an app-owned Audiomack service

Deferred because it would duplicate the plugin's search, playback, album, chart, and playlist behavior. A provider-scoped managed plugin is the smallest maintainable fix and matches the existing Bilibili compatibility architecture.

## Components

### Bundled Audiomack plugin

The bundled source retains the installed plugin's existing features and changes only recommendation category discovery, defensive response handling, version metadata, and remote-update behavior. It will not expose a `srcUrl`, preventing the compatibility build from being silently replaced by the obsolete remote plugin.

### Category policy

A small immutable category table is the single source for the recommendation tabs. Tag normalization accepts only the known slugs and falls back to What's New. The plugin will return copied category objects so callers cannot mutate the shared table.

### Managed lifecycle

The existing atomic managed-plugin lifecycle will install Audiomack when absent, upgrade exact-platform `Audiomack` versions older than `0.0.3-mymusic.1`, preserve newer user-installed versions, reconcile duplicates, and leave every other provider untouched. Installation failure remains non-fatal and redacted.

## Data Flow

1. MyMusic finishes normal plugin discovery during bootstrap.
2. The managed-plugin bootstrap verifies the bundled Audiomack plugin and atomically installs or upgrades it when required.
3. The recommendations screen requests Audiomack tags.
4. The plugin returns the built-in verified category list without downloading or parsing website HTML.
5. Selecting a tag calls the signed Audiomack playlist-categories endpoint using its verified slug.
6. The response is validated before playlist items are formatted and returned to the screen.

## Error Handling and Security

- Treat API responses, saved tags, playlist fields, and media URLs as untrusted data.
- Normalize unknown or incomplete recommendation tags to What's New.
- Return an empty page for a successful but structurally invalid playlist response instead of throwing a property-access error.
- Preserve provider HTTP failures for the app's existing user-facing error flow without logging OAuth signatures, request URLs, response bodies, or signed media URLs.
- Keep the plugin source app-owned and remove its remote self-update URL.
- Preserve the managed lifecycle's HTTPS, atomic installation, path-containment, and no-downgrade protections.

## Testing

Following TDD, tests will first reproduce the missing-`__NEXT_DATA__` failure. Coverage will then verify the managed identity, absence of `srcUrl`, immutable built-in tag output, no recommendation-page HTML request, known tag routing, stale tag fallback, malformed API response handling, Audiomack upgrade behavior, and isolation from other plugins.

The full Jest suite must remain above 80% coverage. Type checking, linting, diff checks, Android debug build, iOS simulator build, signed iOS release build, install, and launch must pass.

## Acceptance Criteria

- Opening Audiomack recommendations shows the nine verified category tabs without an error.
- What's New and each verified category load playlist cards from the signed API.
- A playlist opens and returns its tracks through the existing Audiomack playlist-detail flow.
- Search, albums, charts, playback, Android behavior, and non-Audiomack providers remain unchanged.
- The fix survives reinstall and restart without manual plugin editing.
- No OAuth signature, signed media URL, cookie, or provider response body is persisted or logged.
