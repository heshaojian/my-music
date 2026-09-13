# Managed Plugin Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a missing bundled 猫耳FM plugin repairable from Plugin Library without downloading or executing the older catalog plugin.

**Architecture:** The bundled descriptor registry remains the trust source. PluginManager exposes exact-name managed repair, the catalog service routes managed actions to that local repair path, and the view model marks managed rows so the UI can show Repair or Managed Installed states. Production-parser coverage proves every embedded source actually mounts in the app runtime.

**Tech Stack:** React Native 0.76, TypeScript, Jest, React Native Testing Library, existing managed-plugin lifecycle, MMKV-backed catalog state.

**Spec:** `docs/superpowers/specs/2026-09-12-managed-plugin-repair-design.md`

## Global Constraints

- Managed providers must never download or execute the official catalog URL during repair.
- Only exact platform names in `BUNDLED_MANAGED_PLUGINS` can be repaired.
- Existing atomic managed-plugin lifecycle behavior must remain unchanged.
- Successful repair must refresh installed state without refetching the catalog.
- Failures must not expose source code, URLs, filesystem paths, or credentials.
- Android and iOS behavior must stay in the shared React Native implementation.

---

### Task 1: Trusted managed descriptor lookup and repair

**Files:**
- Modify: `src/core/pluginManager/managed/ensureBundledManagedPlugins.ts`
- Modify: `src/core/pluginManager/index.ts`
- Modify: `src/types/core/pluginManager/index.d.ts`
- Test: `src/core/pluginManager/managed/__tests__/ensureBundledManagedPlugins.test.ts`

**Interfaces:**
- Produces: `getBundledManagedPlugin(platform: string): ManagedPluginDescriptor | undefined`
- Produces: `PluginManager.repairManagedPlugin(platform: string): Promise<IInstallPluginResult>`

- [ ] **Step 1: Write failing lookup and repair tests**

```ts
expect(getBundledManagedPlugin("猫耳FM")).toMatchObject({
    platform: "猫耳FM",
    version: "0.1.5-mymusic.1",
});
expect(getBundledManagedPlugin("unknown")).toBeUndefined();

await expect(manager.repairManagedPlugin("猫耳FM")).resolves.toMatchObject({
    success: true,
    pluginName: "猫耳FM",
});
await expect(manager.repairManagedPlugin("unknown")).resolves.toMatchObject({
    success: false,
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx jest src/core/pluginManager/managed/__tests__/ensureBundledManagedPlugins.test.ts --runInBand`

Expected: FAIL because lookup and repair APIs do not exist.

- [ ] **Step 3: Implement exact-name lookup and manager repair**

```ts
export function getBundledManagedPlugin(platform: string) {
    return BUNDLED_MANAGED_PLUGINS.find(
        descriptor => descriptor.platform === platform,
    );
}

async repairManagedPlugin(platform: string): Promise<IInstallPluginResult> {
    const descriptor = getBundledManagedPlugin(platform);
    if (!descriptor) {
        return { success: false, message: "Managed plugin is unavailable" };
    }
    try {
        const result = await this.ensureManagedPlugin(descriptor);
        return {
            success: true,
            pluginName: result.plugin.name,
            pluginHash: result.plugin.hash,
        };
    } catch {
        errorLog("Managed plugin repair failed", { platform });
        return { success: false, message: "Managed plugin repair failed" };
    }
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx jest src/core/pluginManager/managed/__tests__/ensureBundledManagedPlugins.test.ts --runInBand`

Expected: PASS.

### Task 2: Catalog routing and managed view state

**Files:**
- Modify: `src/core/pluginCatalog/types.ts`
- Modify: `src/core/pluginCatalog/service.ts`
- Modify: `src/core/pluginCatalog/viewModel.ts`
- Modify: `src/core/pluginCatalog/index.ts`
- Test: `src/core/pluginCatalog/__tests__/service.test.ts`
- Test: `src/core/pluginCatalog/__tests__/viewModel.test.ts`

**Interfaces:**
- Consumes: `repairManagedPlugin(platform: string): Promise<IInstallPluginResult>`
- Produces: `CatalogInstaller.isManagedPlugin(platform: string): boolean`
- Produces: `CatalogViewItem.managed: boolean`

- [ ] **Step 1: Write failing catalog tests**

```ts
dependencies.installer.isManagedPlugin.mockImplementation(
    name => name === "猫耳FM",
);
await service.install(maoerEntry);
expect(dependencies.installer.repairManagedPlugin)
    .toHaveBeenCalledWith("猫耳FM");
expect(dependencies.installer.installPluginFromUrl).not.toHaveBeenCalled();

expect(buildCatalogViewItems([maoerEntry], [], "")).toEqual([
    expect.objectContaining({ managed: true, status: "available" }),
]);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx jest src/core/pluginCatalog/__tests__/service.test.ts src/core/pluginCatalog/__tests__/viewModel.test.ts --runInBand`

Expected: FAIL because managed capabilities and flags are absent.

- [ ] **Step 3: Route validated managed entries to local repair**

```ts
export interface CatalogInstaller {
    installPluginFromUrl(url: string): Promise<IInstallPluginResult>;
    repairManagedPlugin(platform: string): Promise<IInstallPluginResult>;
    isManagedPlugin(platform: string): boolean;
    getInstalledPlugins(): InstalledPluginSnapshot[];
}

if (dependencies.installer.isManagedPlugin(approvedEntry.name)) {
    return dependencies.installer.repairManagedPlugin(approvedEntry.name);
}
return dependencies.installer.installPluginFromUrl(approvedEntry.url);
```

Pass `isBundledManagedPluginPlatform` into `buildCatalogViewItems` through an optional predicate defaulting to the production registry, and return a new item object with `managed` set. Do not mutate catalog entries.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npx jest src/core/pluginCatalog/__tests__/service.test.ts src/core/pluginCatalog/__tests__/viewModel.test.ts --runInBand`

Expected: PASS, including proof that remote installation is not called.

### Task 3: Repair and managed-installed UI

**Files:**
- Modify: `src/pages/setting/settingTypes/pluginSetting/components/catalogPluginItem.tsx`
- Modify: `src/core/i18n/languages/en-us.json`
- Modify: `src/core/i18n/languages/zh-cn.json`
- Modify: `src/core/i18n/languages/zh-tw.json`
- Test: `src/pages/setting/settingTypes/pluginSetting/__tests__/catalogPluginItem.test.tsx`
- Test: `src/pages/setting/settingTypes/pluginSetting/__tests__/usePluginCatalog.test.tsx`

**Interfaces:**
- Consumes: `CatalogViewItem.managed`
- Keeps: `onInstall(item)` as the single action callback; the service decides repair versus remote install.

- [ ] **Step 1: Write failing component and hook tests**

```tsx
render(<CatalogPluginItem
    item={{ ...maoerEntry, managed: true, status: "available" }}
    busy={false}
    onInstall={onInstall}
/>);
expect(screen.getByText("Repair")).toBeTruthy();

render(<CatalogPluginItem
    item={{ ...maoerEntry, managed: true, status: "installed" }}
    busy={false}
    onInstall={onInstall}
/>);
expect(screen.getByText("Installed · Managed by MyMusic")).toBeTruthy();
```

Hook coverage must resolve repair successfully, prove installed snapshots are re-read, and verify the row transitions to installed without calling refresh.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx jest src/pages/setting/settingTypes/pluginSetting/__tests__/catalogPluginItem.test.tsx src/pages/setting/settingTypes/pluginSetting/__tests__/usePluginCatalog.test.tsx --runInBand`

Expected: FAIL because Repair and managed status copy do not exist.

- [ ] **Step 3: Implement localized managed labels**

```ts
const actionText = item.managed && item.status !== "installed"
    ? t("pluginLibrary.action.repair")
    : item.status === "update"
        ? t("pluginLibrary.action.update")
        : item.status === "installed"
            ? t("pluginLibrary.status.installed")
            : t("pluginLibrary.action.install");

const statusText = item.managed && item.status === "installed"
    ? t("pluginLibrary.status.managedInstalled")
    : t(`pluginLibrary.status.${item.status}`);
```

Add equivalent English, Simplified Chinese, and Traditional Chinese strings with identical key structure.

- [ ] **Step 4: Run tests and verify GREEN**

Run the two component/hook files again. Expected: PASS.

### Task 4: Real managed-source mount regression

**Files:**
- Create: `src/core/pluginManager/managed/__tests__/managedPluginProductionMount.test.ts`

**Interfaces:**
- Consumes: `BUNDLED_MANAGED_PLUGINS` and production `Plugin`.
- Produces: a release gate ensuring all embedded descriptors mount with matching identity/version.

- [ ] **Step 1: Write the production parser test**

```ts
for (const descriptor of BUNDLED_MANAGED_PLUGINS) {
    const plugin = new Plugin(descriptor.source, "managed-plugin://test");
    expect(plugin.state).toBe(PluginState.Mounted);
    expect(plugin.name).toBe(descriptor.platform);
    expect(plugin.instance.version).toBe(descriptor.version);
}
```

Mock only native modules, filesystem, device info, logging, and persisted metadata. Do not replace `Plugin.mountPlugin`, runtime creation, source strings, or dependency injection.

- [ ] **Step 2: Run the test and inspect any RED failure**

Run: `npx jest src/core/pluginManager/managed/__tests__/managedPluginProductionMount.test.ts --runInBand`

Expected: either PASS, proving the device loss was registry-state related, or a specific descriptor failure that must be corrected before proceeding.

- [ ] **Step 3: If 猫耳FM source fails, minimally correct its embedded source**

Keep the exported platform and version exact, preserve Missevan HTTPS host validation, protected-HLS rejection, and no-store behavior. Add the failing syntax/runtime case to the same test before changing the source.

- [ ] **Step 4: Run managed and provider tests**

Run: `npx jest src/core/pluginManager/managed/__tests__ src/core/pluginManager/__tests__/mediaSourcePolicy.test.ts --runInBand`

Expected: PASS.

### Task 5: Release verification and device installation

**Files:**
- No source files unless verification exposes a defect.

**Interfaces:**
- Consumes the completed shared React Native repair path.
- Produces Android APK, signed iOS app, device installation, and evidence.

- [ ] **Step 1: Run repository gates**

Run: `npm test -- --runInBand`, `npm run typecheck`, and targeted ESLint. Expected: zero failures and zero lint errors.

- [ ] **Step 2: Run live provider compatibility**

Run iOS and Android variants with `LIVE_MANAGED_PLUGIN_TESTS=1`. Expected: 猫耳FM search returns rows; any returned direct source is reachable.

- [ ] **Step 3: Build Android and iOS artifacts**

Run `npm run build:android:debug`. Build the iOS Release shell without rebundling, generate the production Hermes bundle, inject it into the signed app, and verify the code signature.

- [ ] **Step 4: Verify UI and behavior in simulator**

Open Plugin Library. Confirm 猫耳FM shows Repair when missing, repair succeeds, then confirm the row shows managed-installed. Search 猫耳FM and attempt a free direct-audio track.

- [ ] **Step 5: Install on the connected iPhone**

Install the exact signed app with `devicectl`. Launch when the phone is unlocked; otherwise report the lock as the only external validation blocker.

- [ ] **Step 6: Review, commit, and push**

Run correctness/security review, explicitly stage only intended files, commit as `fix: repair missing managed plugins`, and push `codex/ios-android-foundation` to the private origin.
