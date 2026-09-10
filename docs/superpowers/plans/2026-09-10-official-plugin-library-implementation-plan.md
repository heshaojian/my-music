# Official Plugin Library Implementation Plan

## Phase 1: English Default

1. Add initialization tests for no saved locale, valid saved locale, and invalid saved locale.
2. Add persistence tests for valid and unsupported language selections.
3. Make `en-US` the explicit startup, selection, and translation fallback.
4. Run focused tests, coverage, typecheck, and lint; commit independently.

## Phase 2: Catalog Domain

1. Define immutable catalog source, entry, cache, status, transport, cache, and installer interfaces.
2. Add tests for HTTPS policy, embedded credentials, field limits, manifest limits, partial validation, normalization, and deterministic deduplication.
3. Implement pure validation, search, and installed/update status functions.
4. Add service tests for cached-first refresh, stale fallback, invalid-cache preservation, and installation delegation.
5. Implement the dependency-injected catalog service.

## Phase 3: Production Adapters

1. Add an Axios text adapter with declared and actual byte limits.
2. Add a versioned MMKV cache adapter.
3. Expose copied installed-plugin metadata from `PluginManager`, including disabled plugins.
4. Add persistent first-install trust-warning acceptance.
5. Test adapters without real network or filesystem access.

## Phase 4: Plugin Library UI

1. Add Plugin Library to the existing Plugin Management navigation stack.
2. Add a catalog hook with cached-first loading, refresh, local search, per-item progress, and unmount safety.
3. Render plugin name, version, source host, textual status, and accessible Install/Update actions.
4. Add fresh, cached-stale, loading, empty, no-results, and retryable-error states.
5. Gate the first installation behind a third-party-code warning.
6. Add matching English, Simplified Chinese, and Traditional Chinese strings.
7. Component-test critical user flows.

## Phase 5: Verification and Delivery

1. Run the full test suite with at least 80% statement/line coverage for the tested scope.
2. Run typecheck and read-only lint.
3. Build Android Debug and iOS Simulator.
4. Review URL validation, response limits, error redaction, cache replacement, and trust messaging.
5. Build, install, and launch the signed iPhone Release.
6. Commit with conventional messages and push the existing feature branch.
