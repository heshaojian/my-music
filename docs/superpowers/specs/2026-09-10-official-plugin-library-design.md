# Official Plugin Library Design

## Goal

Give MyMusic users a safe, simple way to discover and install plugins from the official MusicFree catalog on both iOS and Android.

## User Experience

Plugin Management gains a **Plugin Library** entry. The library displays the official catalog with:

- local name search;
- plugin name, version, and source host;
- available, installed, and update-available states;
- one-tap Install or Update actions;
- pull-to-refresh and clear loading, empty, cached, and error states.

No plugin is installed or executed automatically. The first attempted catalog installation displays a concise warning that plugins are third-party executable code. Existing local-file, direct-URL, subscription, sorting, update, and uninstall functions remain available under Plugin Management.

## Architecture

### Catalog source

The app contains one built-in catalog descriptor for the official MusicFree plugin manifest at `https://raw.githubusercontent.com/maotoumao/MusicFreePlugins/master/plugins.json`. The descriptor has a stable identifier, display name, HTTPS manifest URL, and trust label. Future catalog sources can use the same interface, but adding community catalogs is outside this change.

### Catalog service

A platform-independent service fetches, validates, normalizes, caches, filters, and returns catalog entries. UI components do not parse remote JSON or install plugins directly.

The service accepts injected network, cache, and installed-plugin dependencies so it can be tested without real network or filesystem access.

### Installation boundary

Catalog installation delegates to the existing plugin manager after validation. The plugin manager remains the single owner of downloading, parsing, version comparison, persistence, and activation. A failed install leaves the existing plugin and catalog cache unchanged.

## Data Flow

1. Open Plugin Library.
2. Read the last validated catalog from local cache, if available.
3. Fetch the official HTTPS manifest.
4. Apply transport limits and schema validation.
5. Normalize and deduplicate entries by canonical URL and plugin name.
6. Compare catalog entries with installed plugins and render their status.
7. Search locally without additional network requests.
8. On Install or Update, show the trust warning when required and delegate the selected URL to the plugin manager.
9. Refresh the installed status after a successful operation.

## Validation and Security

- Only HTTPS catalog and plugin URLs are accepted.
- Catalog responses have explicit byte and entry-count limits.
- Every entry requires a non-empty name, supported version string, and valid URL.
- Unsupported fields are ignored rather than executed or rendered as markup.
- Duplicate entries are removed deterministically.
- Catalog content is treated as untrusted even though the source is official.
- Plugin validation occurs before the downloaded code is written into managed storage.
- Errors and logs exclude plugin contents, credentials, headers, and private filesystem paths.
- The UI states plainly that the runtime provides compatibility, not a security sandbox.

The upstream manifest does not publish cryptographic hashes or signatures. HTTPS transport and strict validation reduce risk but do not provide supply-chain integrity. Signed manifests can be added later without changing the catalog UI contract.

## Offline and Error Behavior

- A valid cached catalog is displayed when refresh fails, with a stale-data notice.
- With no cache, the library displays an actionable retry state.
- One malformed entry does not hide other valid entries.
- A fully invalid manifest is rejected and never replaces the last valid cache.
- Install and update failures are shown on the affected item and do not block other items.
- Cancellation or navigation away does not install anything.

## Localization and Accessibility

All new labels are added to English, Simplified Chinese, and Traditional Chinese resources. English remains the default-language goal defined in the separate English-default specification. Buttons expose accessible labels and disabled/loading states, and status is not communicated by color alone.

## Testing

Follow test-driven development:

1. Unit-test manifest validation, URL policy, byte/count limits, normalization, deduplication, search, and installed/update status.
2. Integration-test cached-first refresh, stale fallback, invalid-manifest preservation, and install delegation.
3. Component-test loading, error, cached, empty, search, install, and update states.
4. Verify iOS and Android builds and manually exercise catalog refresh plus one fixture-plugin install.

Changed modules must retain at least 80% statement and line coverage. Typecheck, read-only lint, the full unit suite, and security review must pass before delivery.

## Out of Scope

- Automatically installing or enabling plugins on first launch.
- Searching arbitrary GitHub or community repositories.
- Rating, reviewing, ranking, or recommending plugins by popularity.
- Claiming that dynamically executed plugins are sandboxed.
- Modifying the public MusicFree plugin protocol.
