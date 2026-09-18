# Community Plugin Defaults Design

## Goal

MyMusic will automatically install a curated community plugin pack alongside
its existing official bundled providers. The initial community pack contains:

- NetEase Cloud Music
- QQ Music
- Kugou
- Kuwo
- Migu
- Ximalaya
- Qishui Music
- 5sing

These plugins are intended for the private, personal-use MyMusic fork. Their
presence does not imply endorsement by MusicFree or the underlying services.

## Product Behavior

- A fresh installation receives every curated community plugin during normal
  application bootstrap without requiring the Plugin Library to be opened.
- An application upgrade restores missing community plugins and replaces
  outdated, duplicated, or modified managed copies with the bundled version.
- Community plugins are enabled by default, consistent with existing bundled
  providers.
- The Plugin Library labels these entries as `Community · Installed by
  MyMusic`, distinct from official MyMusic recommendations and user-installed
  third-party plugins.
- Failure to restore one provider does not block the remaining providers or
  application startup. The failed provider remains visible with a retry action.

## Trust and Distribution Model

Community plugins are vendored into the application as reviewed source
snapshots. MyMusic does not execute a live community catalog, follow mutable
plugin URLs during bootstrap, or silently accept upstream code changes.

Each community descriptor contains an immutable platform identifier, bundled
version, source snapshot, provenance metadata, and source hash. Updates require
an explicit MyMusic code change and release. The existing atomic managed-plugin
lifecycle remains responsible for staging, parsing, validation, promotion,
duplicate removal, and restoration.

The eight community platform identifiers are reserved from replacement through
local-file or remote installation. Exact, case-sensitive identifiers are used
for all repair operations.

## Source Selection and Review

For each provider, implementation must select one source that is currently
functional on the MusicFree React Native runtime. Selection favors maintained
repositories, direct service endpoints, HTTPS transport, readable source, and
account-scoped access where authentication is required.

A candidate is rejected if it:

- advertises VIP, paid-content, DRM, regional, or copyright bypass;
- depends on an unknown relay, proxy, or media-unlocking service;
- sends credentials, cookies, tokens, or user data to unrelated hosts;
- uses plaintext HTTP for credentials, plugin updates, or media resolution;
- downloads or evaluates additional executable code at runtime;
- embeds private credentials or undocumented third-party API keys;
- cannot mount or complete its basic provider flow on the supported runtime.

If no acceptable implementation exists for a named provider, MyMusic keeps a
visible unavailable community entry with a concise reason rather than bundling
unsafe code or substituting an unrelated provider.

## Architecture

### Registry

The managed-plugin registry will distinguish `official` and `community`
descriptors while preserving a single immutable source of truth for platform,
version, source, provenance, and trust tier. Registry accessors return copied,
source-free recommendation metadata to UI and catalog code.

### Bootstrap

The existing bootstrap sequence continues to load persisted plugins, prepare
secure credential storage, and reconcile managed descriptors. Official and
community descriptors use the same idempotent lifecycle. Reconciliation is
sequential so provider failures remain isolated and filesystem publication
stays deterministic.

### Plugin Library

The catalog view model projects community descriptors into permanent local
entries. Remote catalog entries cannot hide, downgrade, redirect, or replace a
community-managed platform. Search and status calculation operate on the merged
official, community, and validated remote entries.

### Credentials

Provider credentials remain in the existing secure plugin metadata storage.
They are never stored in bundled source, logs, catalog cache, or recommendation
metadata. Removing or upgrading a community plugin preserves user variables
only through the existing secure-storage lifecycle.

## Failure Handling

- Provider installation errors are reduced to provider name, trust tier, and a
  generic outcome.
- URLs, local paths, response bodies, cookies, tokens, and source code are not
  included in logs or UI errors.
- One failed provider does not roll back successfully reconciled providers.
- Retry invokes only the exact bundled descriptor and never a remote URL.
- A source-hash or platform mismatch fails closed.

## Testing and Verification

Implementation follows test-driven development and must cover:

- registry projection and immutability for both trust tiers;
- all eight community entries appearing without a remote catalog;
- startup installation on an empty plugin directory;
- idempotent restart behavior;
- restoration of missing, outdated, duplicated, and tampered copies;
- exact-name identity reservation against local and remote replacement;
- redaction of credentials, source, paths, URLs, and provider responses;
- provider failure isolation and retry behavior;
- UI labels and status states for community entries;
- runtime mounting and representative search/playback or account-authorized
  access for every accepted provider on Android and iOS where supported.

Changed modules must retain at least 80% statement and line coverage. Delivery
requires focused unit tests, type checking, lint checking, an Android debug
build, an iOS production bundle, and physical-device smoke verification when a
device is available.

## Migration and Compatibility

Existing official managed plugins and ordinary user-installed plugins remain
unchanged. When an existing user-installed plugin has the same exact platform
identifier as a new community descriptor, the reviewed bundled copy replaces
it atomically. User configuration is preserved through secure metadata storage.

No remote catalog schema migration is required. Recommendation metadata gains
a trust-tier field with a safe fallback for cached records created by older
versions.

## Legal and Operational Boundary

The upstream MusicFree project removed several domestic commercial music
sources after receiving a legal notice. This private fork will not present the
community pack as official, distribute bypass functionality, or guarantee that
a provider's endpoints remain permitted or available. Providers must access
only content the user is authorized to access, and a provider can be removed
from a later build if its safety, legality, or maintainability changes.

## Out of Scope

- Automatically importing an entire live community aggregator.
- Background execution of mutable remote plugin code.
- VIP, DRM, regional, payment, or copyright bypass.
- Hosting community plugin source for third-party distribution.
- Replacing the existing official MusicFree catalog.
- Broad React Native, Expo, or player refactoring.
