# Bundled Recommended Plugins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every bundled MyMusic provider, including 猫耳FM, a permanent recommended-list entry that is automatically reconciled from trusted local source.

**Architecture:** Project source-free recommendation metadata from the existing managed descriptor registry, merge it ahead of validated remote catalog entries by exact platform name, and automatically reconcile any missing managed entry when the library opens. The plugin manager remains the only component allowed to access bundled source code or perform managed installation.

**Tech Stack:** React Native, TypeScript, Jest, React Testing Library, Jotai/MMKV-backed plugin manager, iOS Hermes, Android Gradle

**Spec:** `docs/superpowers/specs/2026-09-13-bundled-recommended-plugins-design.md`

## Global Constraints

- `BUNDLED_MANAGED_PLUGINS` remains the single source of truth for platform, bundled version, and trusted source.
- Managed recommendations must not require a remote catalog response or a remote plugin URL.
- Remote entries cannot replace, downgrade, hide, or redirect an exact-name managed recommendation.
- Managed reconciliation accepts exact platform names only and never calls `installPluginFromUrl`.
- Existing non-managed plugins and the third-party trust warning remain unchanged.
- Errors expose only generic operation state and platform identity.
- Changed modules require at least 80% statement and line coverage.

---

### Task 1: Expose Source-Free Managed Recommendation Metadata

**Files:**
- Modify: `src/core/pluginManager/managed/ensureBundledManagedPlugins.ts`
- Modify: `src/core/pluginManager/index.ts`
- Modify: `src/types/core/pluginManager/index.d.ts`
- Test: `src/core/pluginManager/managed/__tests__/ensureBundledManagedPlugins.test.ts`

**Interfaces:**
- Consumes: `BUNDLED_MANAGED_PLUGINS: readonly ManagedPluginDescriptor[]`
- Produces: `ManagedPluginRecommendation { platform: string; version: string }`
- Produces: `getBundledManagedPluginRecommendations(): readonly ManagedPluginRecommendation[]`
- Produces: `PluginManager.getManagedPluginRecommendations(): ManagedPluginRecommendation[]`

- [ ] **Step 1: Write failing metadata tests**

```ts
it("projects every bundled provider without exposing source", () => {
    const recommendations = getBundledManagedPluginRecommendations();
    expect(recommendations).toContainEqual({
        platform: "猫耳FM",
        version: "0.1.5-mymusic.1",
    });
    expect(recommendations).toHaveLength(BUNDLED_MANAGED_PLUGINS.length);
    expect(recommendations.every(item => !("source" in item))).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx jest src/core/pluginManager/managed/__tests__/ensureBundledManagedPlugins.test.ts --runInBand`

Expected: FAIL because `getBundledManagedPluginRecommendations` does not exist.

- [ ] **Step 3: Implement immutable source-free projection**

```ts
export interface ManagedPluginRecommendation {
    readonly platform: string;
    readonly version: string;
}

export function getBundledManagedPluginRecommendations() {
    return BUNDLED_MANAGED_PLUGINS.map(({ platform, version }) => ({
        platform,
        version,
    }));
}
```

Add a plugin-manager method that returns a new array from this function and declare it in `IPluginManager`.

- [ ] **Step 4: Run the focused test and typecheck**

Run: `npx jest src/core/pluginManager/managed/__tests__/ensureBundledManagedPlugins.test.ts --runInBand && npm run typecheck`

Expected: PASS.

---

### Task 2: Merge MyMusic Recommendations Ahead of Remote Entries

**Files:**
- Modify: `src/core/pluginCatalog/types.ts`
- Modify: `src/core/pluginCatalog/service.ts`
- Modify: `src/core/pluginCatalog/viewModel.ts`
- Test: `src/core/pluginCatalog/__tests__/service.test.ts`
- Test: `src/core/pluginCatalog/__tests__/viewModel.test.ts`

**Interfaces:**
- Consumes: `CatalogInstaller.getManagedPluginRecommendations()`
- Produces: `CatalogViewItem` with `managed: boolean` and a deterministic `managed-plugin:<platform>` ID for local recommendations
- Produces: `buildCatalogViewItems(entries, installed, query, recommendations)`

- [ ] **Step 1: Write failing merge tests**

```ts
it("shows 猫耳FM when the remote catalog is empty", () => {
    expect(buildCatalogViewItems([], [], "", [{
        platform: "猫耳FM",
        version: "0.1.5-mymusic.1",
    }])).toContainEqual(expect.objectContaining({
        id: "managed-plugin:猫耳FM",
        name: "猫耳FM",
        managed: true,
    }));
});

it("lets the managed recommendation replace a same-name remote row", () => {
    const items = buildCatalogViewItems([remoteMaoer], [], "", [managedMaoer]);
    expect(items.filter(item => item.name === "猫耳FM")).toHaveLength(1);
    expect(items[0]).toMatchObject({ managed: true, host: "MyMusic" });
});
```

- [ ] **Step 2: Run view-model tests and verify RED**

Run: `npx jest src/core/pluginCatalog/__tests__/viewModel.test.ts --runInBand`

Expected: FAIL because recommendation metadata is not accepted or merged.

- [ ] **Step 3: Implement deterministic immutable merge**

Create managed display entries from recommendation metadata, remove remote rows whose exact name is managed, prepend managed rows, then apply the existing local search. Use a local URI only as a display-model field; never normalize or fetch it.

```ts
const managedItems = recommendations.map(({ platform, version }) => ({
    id: `managed-plugin:${platform}`,
    name: platform,
    version,
    url: `managed-plugin:${encodeURIComponent(platform)}`,
    host: "MyMusic",
    managed: true,
}));
```

Expose `getManagedPluginRecommendations` through the catalog service as copied metadata. Extend test dependencies with exact source-free fixtures.

- [ ] **Step 4: Run service/view-model tests and typecheck**

Run: `npx jest src/core/pluginCatalog/__tests__/service.test.ts src/core/pluginCatalog/__tests__/viewModel.test.ts --runInBand && npm run typecheck`

Expected: PASS.

---

### Task 3: Automatically Reconcile Missing Recommendations

**Files:**
- Modify: `src/core/pluginCatalog/service.ts`
- Modify: `src/pages/setting/settingTypes/pluginSetting/hooks/usePluginCatalog.ts`
- Test: `src/core/pluginCatalog/__tests__/service.test.ts`
- Test: `src/pages/setting/settingTypes/pluginSetting/__tests__/usePluginCatalog.test.tsx`

**Interfaces:**
- Consumes: `repairManagedPlugin(platform: string): Promise<IInstallPluginResult>`
- Produces: `reconcileManagedRecommendations(): Promise<Record<string, string>>`, returning only provider-scoped failures

- [ ] **Step 1: Write failing automatic-reconciliation tests**

```ts
it("reconciles only missing managed recommendations", async () => {
    dependencies.installer.getInstalledPlugins.mockReturnValue([]);
    await service.reconcileManagedRecommendations();
    expect(dependencies.installer.repairManagedPlugin)
        .toHaveBeenCalledWith("猫耳FM");
    expect(dependencies.installer.installPluginFromUrl).not.toHaveBeenCalled();
});

it("refreshes the installed snapshot after local reconciliation", async () => {
    renderHook(() => usePluginCatalog());
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));
    expect(mockGetInstalledPlugins).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx jest src/core/pluginCatalog/__tests__/service.test.ts src/pages/setting/settingTypes/pluginSetting/__tests__/usePluginCatalog.test.tsx --runInBand`

Expected: FAIL because reconciliation does not exist.

- [ ] **Step 3: Implement idempotent local reconciliation**

The catalog service compares exact recommendation platform names with the installed snapshot and calls `repairManagedPlugin` only for missing entries. It collects generic failures by platform and never invokes remote installation.

The hook starts local reconciliation on mount, tracks immutable `reconciling` and failure maps, rereads installed plugins on completion, and ignores state updates after unmount.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx jest src/core/pluginCatalog/__tests__/service.test.ts src/pages/setting/settingTypes/pluginSetting/__tests__/usePluginCatalog.test.tsx --runInBand && npm run typecheck`

Expected: PASS.

---

### Task 4: Replace Manual Repair With Recommended Status

**Files:**
- Modify: `src/pages/setting/settingTypes/pluginSetting/components/catalogPluginItem.tsx`
- Modify: `src/pages/setting/settingTypes/pluginSetting/views/pluginLibrary.tsx`
- Modify: `src/core/i18n/languages/en-us.json`
- Modify: `src/core/i18n/languages/zh-cn.json`
- Modify: `src/core/i18n/languages/zh-tw.json`
- Modify: `src/types/core/i18n/index.d.ts`
- Test: `src/pages/setting/settingTypes/pluginSetting/__tests__/catalogPluginItem.test.tsx`
- Test: `src/pages/setting/settingTypes/pluginSetting/__tests__/pluginLibrary.test.tsx`

**Interfaces:**
- Consumes: managed view items and hook reconciliation state
- Produces: `Installed · Recommended by MyMusic`, `Restoring`, and `Retry` UI states

- [ ] **Step 1: Write failing UI tests**

```tsx
expect(screen.getByText(
    "0.1.5-mymusic.1 - MyMusic - pluginLibrary.status.recommendedInstalled",
)).toBeTruthy();
expect(screen.queryByText("pluginLibrary.action.repair")).toBeNull();
```

Add tests that a missing managed row renders `Restoring`, a failed reconciliation renders `Retry`, retry calls managed reconciliation, and managed actions never show the third-party warning.

- [ ] **Step 2: Run component tests and verify RED**

Run: `npx jest src/pages/setting/settingTypes/pluginSetting/__tests__/catalogPluginItem.test.tsx src/pages/setting/settingTypes/pluginSetting/__tests__/pluginLibrary.test.tsx --runInBand`

Expected: FAIL because the old Repair copy and behavior remain.

- [ ] **Step 3: Implement recommended UI states and translations**

Use these English values and equivalent Simplified/Traditional Chinese translations:

```json
{
  "pluginLibrary.status.recommendedInstalled": "Installed · Recommended by MyMusic",
  "pluginLibrary.status.restoring": "Restoring",
  "pluginLibrary.action.retry": "Retry"
}
```

Remove `pluginLibrary.action.repair`. Keep healthy managed rows disabled; allow Retry only after local reconciliation failure. Non-managed Install/Update continues through the trust dialog.

- [ ] **Step 4: Run UI tests, locale checks, and typecheck**

Run: `npx jest src/pages/setting/settingTypes/pluginSetting/__tests__/catalogPluginItem.test.tsx src/pages/setting/settingTypes/pluginSetting/__tests__/pluginLibrary.test.tsx src/core/i18n/__tests__/index.test.ts --runInBand && npm run typecheck`

Expected: PASS.

---

### Task 5: Production Verification and Delivery

**Files:**
- Test: `src/core/pluginManager/__tests__/recommendationLogging.test.ts`
- Verify: all changed files

**Interfaces:**
- Consumes: all previous tasks
- Produces: signed, installed iOS build and Android debug APK

- [ ] **Step 1: Verify production mounting identity and hash**

Extend the existing table test so every descriptor asserts:

```ts
expect(plugin.state).toBe(PluginState.Mounted);
expect(plugin.name).toBe(descriptor.platform);
expect(plugin.instance.version).toBe(descriptor.version);
expect(plugin.hash.length).toBeGreaterThan(0);
```

- [ ] **Step 2: Run full automated verification**

Run:

```bash
npm test -- --runInBand
npm run typecheck
npm run lint:check
```

Expected: all tests and type checking pass, with no new lint errors.

- [ ] **Step 3: Verify changed-module coverage**

Run focused Jest coverage for managed registry, catalog service/view model, hook, and UI components.

Expected: at least 80% statements and lines for every changed behavior module.

- [ ] **Step 4: Run live 猫耳FM checks**

Run:

```bash
LIVE_MANAGED_PLUGIN_TESTS=1 LIVE_PLUGIN_OS=ios npx jest src/core/pluginManager/managed/__tests__/liveManagedProviders.test.ts --runInBand --testNamePattern=MaoerFM
LIVE_MANAGED_PLUGIN_TESTS=1 LIVE_PLUGIN_OS=android npx jest src/core/pluginManager/managed/__tests__/liveManagedProviders.test.ts --runInBand --testNamePattern=MaoerFM
```

Expected: both pass with returned rows and safely classified media.

- [ ] **Step 5: Build both platforms**

Run `npm run build:android:debug`. Build the iOS production Hermes bundle, inject it into the signed Release app shell, and verify the signature.

Expected: Android `BUILD SUCCESSFUL`; iOS bundle and signature validation succeed.

- [ ] **Step 6: Review security and correctness**

Review the complete diff for remote-code boundary bypasses, forged managed identities, source leakage, stale state, and regressions. Resolve all critical/high findings and rerun affected tests.

- [ ] **Step 7: Install, launch, commit, and push**

Install and launch `com.heshaojian.FreeMusic` on the connected iPhone. Stage only intended tracked files, preserving unrelated untracked duplicates. Commit with:

```bash
git commit -m "fix: bundle recommended plugins in library"
git push -u origin codex/ios-android-foundation
```

Expected: device launch succeeds and the private origin branch contains the verified commit.
