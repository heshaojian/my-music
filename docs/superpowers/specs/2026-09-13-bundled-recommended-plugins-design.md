# Bundled Recommended Plugins Design

## Goal

MyMusic must always present its supported bundled providers, including 猫耳FM, as recommended plugins. These providers must be available after a fresh installation or application upgrade without requiring a manual remote installation or a `Repair` action.

## User Experience

- The Plugin Library always contains every MyMusic-recommended provider, even when the remote MusicFree catalog is unavailable or no longer lists it.
- A healthy bundled provider is labeled `Installed · Recommended by MyMusic`.
- A bundled provider that cannot be restored is still visible and shows a provider-scoped failure state with a retry action. It must never be presented as an ordinary remote installation.
- Starting the application automatically installs, upgrades, or reconciles each bundled provider before the Plugin Library can report its installed state.
- Third-party catalog plugins keep the existing Install/Update flow and trust warning.

## Architecture

### Recommended Plugin Registry

The existing `BUNDLED_MANAGED_PLUGINS` registry remains the single source of truth for trusted source code, platform identity, and bundled version. A catalog projection converts each descriptor into a MyMusic recommendation record without exposing its source code to the UI.

The projection has a deterministic MyMusic-owned identifier and a synthetic local source label. It does not use a remote plugin URL and cannot enter the third-party download path.

### Catalog Merge

The Plugin Library combines two immutable inputs:

1. MyMusic recommendations projected from the bundled registry.
2. Validated entries from the remote MusicFree catalog.

The merge is deterministic and gives the MyMusic recommendation precedence when platform names match. Remote entries may add providers, but they cannot replace, downgrade, hide, or change the action for a bundled provider. Search and status calculation operate on the merged result.

### Automatic Reconciliation

Application bootstrap continues to await `ensureBundledManagedPlugins` after loading the persisted plugin registry. Each descriptor is checked by exact platform, version, and source hash. Missing, outdated, duplicated, or tampered managed copies are atomically reconciled from bundled source.

The Plugin Library reads the installed snapshot only after bootstrap completes. Opening the library also performs a local, idempotent reconciliation before rendering the final installed state, covering storage cleanup or corruption that occurs after startup.

### Installation Boundary

Recommended managed entries are never passed to `installPluginFromUrl`. Their action invokes exact-name reconciliation against `BUNDLED_MANAGED_PLUGINS`. Unknown or case-variant names fail closed. The service uses its validated/merged entry rather than trusting mutable display data supplied by the component.

Remote entries retain HTTPS validation, catalog validation, size limits, and the third-party trust warning.

## State and Errors

- `installed`: exact trusted bundled provider is present and usable.
- `reconciling`: local managed reconciliation is running.
- `error`: reconciliation failed; show a localized message and `Retry`.
- Remote providers continue to use `available`, `installed`, and `update`.

Errors may include only the platform name and a generic operation result. File paths, bundled source, remote response bodies, credentials, and provider tokens must not be logged or shown.

## Testing

Tests will verify:

- 猫耳FM and every bundled descriptor appear without a remote catalog.
- MyMusic recommendations precede same-name remote entries.
- A remote catalog cannot hide, downgrade, or redirect a managed recommendation.
- Fresh-install and missing-plugin states automatically reconcile without a user action.
- Exact platform identity is required and forged display data cannot cross the managed boundary.
- Healthy recommendations render `Installed · Recommended by MyMusic`.
- Reconciliation failure remains visible and retryable without attempting a remote download.
- All bundled sources mount through the production plugin runtime with matching platform/version and a non-empty hash.
- Existing third-party installation and warning behavior remains unchanged.

Changed modules must retain at least 80% statement and line coverage. The full unit suite, type checking, lint checking, Android debug build, iOS production bundle, live 猫耳FM checks for both platform modes, signing, physical-device installation, and launch verification are required before delivery.

## Migration

No persisted schema migration is required. Existing remote 猫耳FM copies are replaced by the trusted bundled descriptor through the current atomic managed-plugin lifecycle. Existing user-installed non-managed plugins remain unchanged.

The previous `Repair` presentation is removed in favor of automatic reconciliation and the permanent MyMusic recommendation entry.

## Out of Scope

- Hosting or modifying the upstream MusicFree plugin catalog.
- Automatically trusting or installing arbitrary remote plugins.
- Adding new provider implementations beyond the currently bundled registry.
- Broad React Native or Expo dependency upgrades.
