# Managed Plugin Repair Design

## Problem

MyMusic bundles trusted replacements for official providers such as 猫耳FM. The official catalog can still show one of those providers as Available when its managed copy is missing from the installed registry. Tapping Install downloads the older public plugin, after which `PluginManager.installPluginFromUrl` correctly rejects it with `This plugin is securely managed by MyMusic`. The user is left with no way to restore the missing trusted copy.

The reported device demonstrates this exact state for 猫耳FM: the official catalog contains version `0.1.4`, while MyMusic bundles `0.1.5-mymusic.1`.

## Decision

Treat catalog actions for bundled providers as local repair operations. Never download or execute the catalog URL for a managed provider.

The Plugin Library will distinguish four useful states:

- Normal catalog plugin, absent: `Install`.
- Normal catalog plugin, present: `Installed` or `Update`.
- Managed plugin, present: `Installed · Managed by MyMusic` with no action.
- Managed plugin, absent: `Repair`, which reinstalls the exact bundled descriptor.

## Architecture

### Managed registry

`ensureBundledManagedPlugins.ts` remains the source of truth for trusted descriptors. It will expose an exact-name descriptor lookup and a one-provider repair function. Unknown names fail closed and never become file paths or remote URLs.

### Plugin manager adapter

`PluginManager` will expose a repair method returning the existing `IInstallPluginResult` envelope. It calls the managed lifecycle with the bundled descriptor, then returns the repaired plugin identity. Errors are reduced to a provider-scoped user message; signed URLs, plugin source, filesystem paths, and credentials are not surfaced.

### Catalog service and view model

The catalog service receives managed-provider capabilities through its installer dependency. When a validated catalog entry is managed, `install(entry)` delegates to local repair rather than `installPluginFromUrl`.

Catalog view items gain a `managed` flag. Status still derives from the current installed snapshot, so a missing managed plugin remains actionable, but the row labels the action `Repair` instead of `Install`. After successful repair, the hook reloads the installed snapshot and the row becomes `Installed · Managed by MyMusic` without a network refresh.

### Compatibility boundary

The managed 猫耳FM source must mount through the real `Plugin` class, not only the lightweight test harness. A production-parser regression test will cover every bundled descriptor so a future source syntax/runtime incompatibility cannot silently remove a provider at startup.

## Data Flow

1. Plugin Library validates and renders the official catalog.
2. The view model identifies 猫耳FM as managed by exact platform name.
3. If the installed registry lacks 猫耳FM, the row shows `Repair`.
4. The user taps Repair.
5. Catalog service validates that the selected entry is still in the active catalog.
6. The installer resolves the embedded 猫耳FM descriptor and runs `ensureManagedPlugin`.
7. The installed snapshot is refreshed locally.
8. The row becomes `Installed · Managed by MyMusic`.

## Error Handling and Security

- Managed repair never fetches the catalog plugin URL.
- Only exact names from `BUNDLED_MANAGED_PLUGINS` can be repaired.
- An unknown or malformed managed request returns a generic failed result.
- Existing atomic stage, verify, promote, publish, and cleanup behavior remains unchanged.
- A failed repair leaves the existing plugin registry untouched and keeps Repair available.
- Logs contain only the provider name and a stable error category.

## Testing

- Catalog status tests cover managed-installed and managed-missing rows.
- Catalog service tests prove managed repair does not call remote installation.
- Hook/component tests cover Repair, busy/error state, and transition to managed-installed.
- Plugin-manager tests cover exact descriptor lookup, successful repair, and unknown-provider rejection.
- A real `Plugin` parser test mounts all bundled sources, including 猫耳FM.
- Existing unit, live-provider, typecheck, lint, Android build, iOS bundle/sign/install, and simulator playback checks remain release gates.

## Acceptance Criteria

- The reported 猫耳FM row no longer offers a misleading remote Install action.
- Repair restores the bundled 猫耳FM plugin without downloading version `0.1.4`.
- A successful repair immediately shows the managed plugin as installed.
- 猫耳FM search returns results and free direct audio remains playable.
- The final signed MyMusic build is installed on the connected iPhone when the device is available.
