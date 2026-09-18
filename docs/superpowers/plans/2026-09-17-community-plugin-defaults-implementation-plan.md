# Community Plugin Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically install a reviewed community provider pack at MyMusic startup while permanently exposing rejected providers as unavailable, source-attributed community entries.

**Architecture:** Keep the existing atomic managed-plugin lifecycle unchanged and add a source-free trust/availability layer around it. Five GPL-3.0 provider snapshots from MusicFree commit `e88f5dea5ea7b2b60ccb3aae6823ca38ec71c5d0` are vendored, hardened, and reconciled locally; 5sing, Kugou, and Qishui are represented as unavailable community recommendations until a compliant implementation exists. The Plugin Library merges official, bundled-community, unavailable-community, and validated remote rows without allowing remote replacement of any reserved platform identity.

**Tech Stack:** React Native 0.76.5, TypeScript, Jest, React Testing Library, Jotai/MMKV, CommonJS MusicFree plugins, Node.js vendoring scripts, Android Gradle, iOS/Xcode

**Spec:** `docs/superpowers/specs/2026-09-17-community-plugin-defaults-design.md`

## Global Constraints

- Initial community identities are `网易云`, `QQ音乐`, `酷我`, `咪咕`, `喜马拉雅`, `5sing`, `酷狗`, and `汽水音乐`.
- Bundled community code is local, immutable, and never refreshed from a live catalog during application bootstrap.
- Community code must not advertise or implement VIP, payment, DRM, regional, or copyright bypass.
- Executable source must contain no plaintext-HTTP request URL, runtime code download/evaluation, embedded credential, or unrelated relay/proxy dependency.
- Plugin credentials remain in the existing secure plugin metadata store and must not appear in source, recommendation metadata, logs, tests, or catalog cache.
- One provider failure must not prevent later providers or application startup.
- Official providers retain `Recommended by MyMusic`; community providers use a distinct `Community · Installed by MyMusic` label.
- Existing user-installed plugins remain unchanged unless their exact, case-sensitive platform identity becomes managed by this feature.
- Changed modules must retain at least 80% statement and line coverage.
- Preserve the user's unrelated `yarn.lock` and duplicate untracked files; stage only files named by the active task.
- If local Node dependencies are dataless or a verification command blocks without output, stop that command, record the environmental blocker, and hydrate or reinstall only after explicit user direction.

## Source Baseline

Use only the GPL-3.0 `dist/<provider>/index.js` files from upstream MusicFreePlugins commit `e88f5dea5ea7b2b60ccb3aae6823ca38ec71c5d0`:

| Provider | Upstream path | Upstream SHA-256 | MyMusic version |
|---|---|---|---|
| 网易云 | `dist/netease/index.js` | `d7d2870acbcca6aaaff6e8d16853f1d3db8ff7342cc5a35cebbf79e20eceebce` | `0.2.4-mymusic.1` |
| QQ音乐 | `dist/qq/index.js` | `983ec034fe343b3fba7d08defff2ee0f9f049291d93aa34bcf667b754fd4ca01` | `0.2.3-mymusic.1` |
| 酷我 | `dist/kuwo/index.js` | `aef76a4fe81fa8bea8eda709666eadd6fe99df5137383978719ac5f925310096` | `0.1.8-mymusic.1` |
| 咪咕 | `dist/migu/index.js` | `45a7d9be59b3fef7e2bc1c7fa2205a12b98776abf560dd5d287acb0b1103659f` | `0.2.3-mymusic.1` |
| 喜马拉雅 | `dist/xmly/index.js` | `ab283d5544c4b40ee53ce9a984c3dcc3bfb39b7c66a443e2497cb6132de4cdce` | `0.1.7-mymusic.1` |

Rejected baselines:

- `5sing` SHA-256 `552ba8baacee803db525a0fe76fb063f628a54fbb6c9c23fbc5062e712ca20d1`: required search/service subdomains fail valid HTTPS certificate checks.
- `酷狗` SHA-256 `c4072abb655cba39ff1352982110131d2cdde89318a9dba81badd5c5a221f21a`: required mobile search/ranking subdomains fail valid HTTPS certificate checks.
- `汽水音乐`: examined community copies either lack a distributable license or depend on `http://api.music.qishui.vsaa.cn` for request signing.

---

### Task 1: Add Managed Trust and Availability Metadata

**Files:**
- Modify: `src/core/pluginCatalog/types.ts`
- Modify: `src/types/core/pluginManager/index.d.ts`
- Modify: `src/core/pluginCatalog/viewModel.ts`
- Test: `src/core/pluginCatalog/__tests__/viewModel.test.ts`

**Interfaces:**
- Produces: `ManagedPluginTrust = "official" | "community"`
- Produces: `ManagedPluginAvailability = "bundled" | "unavailable"`
- Produces: `ManagedPluginRecommendation { platform: string; version?: string; trust: ManagedPluginTrust; availability: ManagedPluginAvailability; reason?: "no-safe-source" }`
- Produces: `CatalogViewItem.managedTrust` and `CatalogViewItem.managedAvailability`

- [ ] **Step 1: Write failing view-model tests**

Add cases that pass one bundled community recommendation and one unavailable community recommendation:

```ts
expect(buildCatalogViewItems([], [], "", [{
    platform: "网易云",
    version: "0.2.4-mymusic.1",
    trust: "community",
    availability: "bundled",
}, {
    platform: "5sing",
    trust: "community",
    availability: "unavailable",
    reason: "no-safe-source",
}])).toMatchObject([{
    name: "网易云",
    host: "Community",
    managed: true,
    managedTrust: "community",
    managedAvailability: "bundled",
}, {
    name: "5sing",
    host: "Community",
    managed: true,
    managedTrust: "community",
    managedAvailability: "unavailable",
    status: "unavailable",
}]);
```

Also assert that a remote `5sing` row is removed when the unavailable managed identity exists.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `./node_modules/.bin/jest src/core/pluginCatalog/__tests__/viewModel.test.ts --runInBand`

Expected: FAIL because trust, availability, and the `unavailable` status do not exist.

- [ ] **Step 3: Add exact shared types**

Use the following source-free recommendation shape in both catalog and plugin-manager declarations:

```ts
export type ManagedPluginTrust = "official" | "community";
export type ManagedPluginAvailability = "bundled" | "unavailable";

export interface ManagedPluginRecommendation {
    readonly platform: string;
    readonly version?: string;
    readonly trust: ManagedPluginTrust;
    readonly availability: ManagedPluginAvailability;
    readonly reason?: "no-safe-source";
}
```

Extend `CatalogEntryStatus` with `"unavailable"`. Extend `CatalogViewItem` with `managedTrust?: ManagedPluginTrust` and `managedAvailability?: ManagedPluginAvailability`.

- [ ] **Step 4: Implement immutable managed projections**

`createManagedCatalogEntry` must use `Community` for community rows, `MyMusic` for official rows, and `Unavailable` as the display version only when `version` is absent. `buildCatalogViewItems` must reserve every managed platform name, set unavailable rows to `status: "unavailable"`, and leave inputs unmodified.

- [ ] **Step 5: Run tests and type checking**

Run: `./node_modules/.bin/jest src/core/pluginCatalog/__tests__/viewModel.test.ts --runInBand && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/pluginCatalog/types.ts src/types/core/pluginManager/index.d.ts src/core/pluginCatalog/viewModel.ts src/core/pluginCatalog/__tests__/viewModel.test.ts
git commit -m "feat: model community plugin trust"
```

### Task 2: Add a Reproducible Community Source Vendor and Audit Pipeline

**Files:**
- Create: `scripts/vendor-community-plugins.cjs`
- Create: `src/core/pluginManager/managed/community/communitySourcePolicy.ts`
- Create: `src/core/pluginManager/managed/community/__tests__/communitySourcePolicy.test.ts`
- Create generated outputs: `src/core/pluginManager/managed/community/sources/{netease,qq,kuwo,migu,ximalaya}PluginSource.ts`

**Interfaces:**
- Produces: `auditCommunityPluginSource(source: string, policy: CommunitySourcePolicy): readonly string[]`
- Produces: `CommunitySourcePolicy { platform: string; allowedHosts: readonly string[]; allowedAnonymousCredentialLiterals?: readonly string[] }`
- Produces: five modules exporting `ManagedPluginDescriptor`

- [ ] **Step 1: Write failing policy tests**

Cover rejection of plaintext HTTP, `eval`, `new Function`, remote `srcUrl`, embedded cookies/tokens, and unrelated hosts. Cover acceptance of a minimal HTTPS-only CommonJS plugin:

```ts
expect(auditCommunityPluginSource(
    'module.exports={platform:"Test",version:"1.0.0",getMediaSource:async()=>({url:"https://media.example.com/a.mp3"})}',
    { platform: "Test", allowedHosts: ["example.com"] },
)).toEqual([]);

expect(auditCommunityPluginSource(
    'eval(await axios.get("http://relay.invalid/code"))',
    { platform: "Test", allowedHosts: ["example.com"] },
)).toEqual(expect.arrayContaining([
    "dynamic-code-execution",
    "plaintext-http",
    "unapproved-host:relay.invalid",
]));
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__/communitySourcePolicy.test.ts --runInBand`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the static policy**

Parse URL literals with a conservative regular expression, normalize hostnames with `URL`, allow an exact host or subdomain of an allowlisted suffix, and return frozen, deterministic reason strings. Reject `/\beval\s*\(/`, `/\bnew\s+Function\b/`, `/\bFunction\s*\(/`, `srcUrl`, plaintext HTTP, and credential assignments containing non-empty literal values for cookie, token, password, secret, API key, or authorization. The only permitted anonymous credential literal is QQ's exact `uin=` placeholder, supplied through `allowedAnonymousCredentialLiterals`; values after `uin=` remain forbidden.

- [ ] **Step 4: Implement the pinned vendor script**

The script must contain the exact commit, upstream paths, upstream hashes, output paths, versions, and transformations from the Source Baseline table. It must:

1. fetch `https://raw.githubusercontent.com/maotoumao/MusicFreePlugins/e88f5dea5ea7b2b60ccb3aae6823ca38ec71c5d0/dist/<provider>/index.js`;
2. verify the upstream SHA-256 before transformation;
3. remove `srcUrl`;
4. replace the exported version with the exact MyMusic version;
5. upgrade QQ request URLs from `http://u.y.qq.com` and `http://c.y.qq.com` to HTTPS, remove the legacy `http://ws` candidate check, and let Task 3's HTTPS hostname validator choose media candidates;
6. upgrade every Kuwo request URL from HTTP to HTTPS;
7. upgrade Migu HTTP referers to HTTPS;
8. run the source policy using these allowlists:

```js
{
  netease: ["music.163.com", "music.126.net"],
  qq: ["y.qq.com", "gtimg.cn", "qqmusic.qq.com"],
  kuwo: ["kuwo.cn"],
  migu: ["migu.cn"],
  ximalaya: ["ximalaya.com", "xmcdn.com"],
}
```

9. write TypeScript modules whose default export is a frozen `{ platform, version, source }` descriptor.

The script exits nonzero before writing any output if a hash or policy check fails. Write outputs through a temporary file followed by rename.

- [ ] **Step 5: Generate the five source modules and test mountability**

Run: `node scripts/vendor-community-plugins.cjs`

Add a test that constructs `Plugin` for every generated descriptor and asserts `PluginState.Mounted`, exact platform, exact version, and a non-empty source hash.

- [ ] **Step 6: Run policy and mount tests**

Run: `./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__ --runInBand`

Expected: PASS with no live network requirement.

- [ ] **Step 7: Commit**

```bash
git add scripts/vendor-community-plugins.cjs src/core/pluginManager/managed/community
git commit -m "feat: vendor audited community plugin sources"
```

### Task 3: Harden NetEase and QQ Playback Boundaries

**Files:**
- Modify generated source inputs/output: `src/core/pluginManager/managed/community/sources/neteasePluginSource.ts`
- Modify generated source inputs/output: `src/core/pluginManager/managed/community/sources/qqPluginSource.ts`
- Test: `src/core/pluginManager/managed/community/__tests__/neteasePluginSource.test.ts`
- Test: `src/core/pluginManager/managed/community/__tests__/qqPluginSource.test.ts`

**Interfaces:**
- Consumes: generated descriptors from Task 2
- Produces: HTTPS-only media results restricted to NetEase or QQ-controlled host suffixes

- [ ] **Step 1: Write failing media-policy tests**

Mock the plugins' `axios` responses with one unsafe `http://relay.invalid/a.mp3` candidate and one safe HTTPS provider candidate. Assert unsafe candidates return `null`/`undefined`, safe candidates return the original URL, and request errors contain no response body or token in logs.

- [ ] **Step 2: Run tests and verify RED**

Run: `./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__/neteasePluginSource.test.ts src/core/pluginManager/managed/community/__tests__/qqPluginSource.test.ts --runInBand`

Expected: FAIL because the legacy plugins trust returned media URLs.

- [ ] **Step 3: Add provider-local URL validation to the transformed sources**

Inject an immutable helper into each transformed source:

```js
function isAllowedMediaUrl(value, allowedSuffixes) {
    if (typeof value !== "string" || value.trim() !== value) return false;
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" &&
            !parsed.username && !parsed.password &&
            allowedSuffixes.some(suffix =>
                parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`));
    } catch {
        return false;
    }
}
```

NetEase allows `music.163.com` and `music.126.net`. QQ allows `qqmusic.qq.com`, `y.qq.com`, and `gtimg.cn`. Apply validation immediately before returning any media URL.

- [ ] **Step 4: Remove self-update and sensitive logging behavior**

Ensure neither plugin exports `srcUrl`, logs request/response objects, or embeds a non-empty cookie/token. Preserve empty anonymous headers only where required by the upstream public endpoint.

- [ ] **Step 5: Run tests and static audits**

Run: `./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__/neteasePluginSource.test.ts src/core/pluginManager/managed/community/__tests__/qqPluginSource.test.ts src/core/pluginManager/managed/community/__tests__/communitySourcePolicy.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/vendor-community-plugins.cjs src/core/pluginManager/managed/community/sources/neteasePluginSource.ts src/core/pluginManager/managed/community/sources/qqPluginSource.ts src/core/pluginManager/managed/community/__tests__
git commit -m "fix: harden community netease and qq plugins"
```

### Task 4: Harden Kuwo, Migu, and Ximalaya Playback Boundaries

**Files:**
- Modify generated source inputs/output: `src/core/pluginManager/managed/community/sources/kuwoPluginSource.ts`
- Modify generated source inputs/output: `src/core/pluginManager/managed/community/sources/miguPluginSource.ts`
- Modify generated source inputs/output: `src/core/pluginManager/managed/community/sources/ximalayaPluginSource.ts`
- Test: `src/core/pluginManager/managed/community/__tests__/{kuwo,migu,ximalaya}PluginSource.test.ts`

**Interfaces:**
- Consumes: generated descriptors and source-policy helper
- Produces: HTTPS-only provider requests and media results for three providers

- [ ] **Step 1: Write failing request and media-policy tests**

For each provider, mock `axios`, invoke one search method and `getMediaSource`, and assert every request URL and returned media URL uses HTTPS and an approved hostname suffix. Include one hostile provider response URL and assert it is rejected.

- [ ] **Step 2: Run tests and verify RED**

Run: `./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__/kuwoPluginSource.test.ts src/core/pluginManager/managed/community/__tests__/miguPluginSource.test.ts src/core/pluginManager/managed/community/__tests__/ximalayaPluginSource.test.ts --runInBand`

Expected: FAIL because legacy results are not host-validated.

- [ ] **Step 3: Add exact host validation**

Use the helper from Task 3 with `kuwo.cn`, `migu.cn`, and `ximalaya.com`/`xmcdn.com`. Reject credentials in URLs and require HTTPS. Convert every static request and referer URL to HTTPS in the vendor transformation.

- [ ] **Step 4: Preserve free-content filtering without bypass logic**

Keep the existing Migu `vipFlag === 0` filters. Do not add quality unlocking, decryption, signature relay, membership impersonation, or fallback to unrelated hosts. Kuwo and Ximalaya return only media URLs directly supplied by their provider responses and accepted by the host validator.

- [ ] **Step 5: Run tests and source policy**

Run: `./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__ --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/vendor-community-plugins.cjs src/core/pluginManager/managed/community/sources src/core/pluginManager/managed/community/__tests__
git commit -m "fix: harden remaining community plugins"
```

### Task 5: Register Bundled and Unavailable Community Providers

**Files:**
- Create: `src/core/pluginManager/managed/community/communityPluginRegistry.ts`
- Modify: `src/core/pluginManager/managed/ensureBundledManagedPlugins.ts`
- Modify: `src/core/pluginManager/index.ts`
- Test: `src/core/pluginManager/managed/__tests__/ensureBundledManagedPlugins.test.ts`
- Test: `src/core/pluginManager/managed/community/__tests__/communityPluginRegistry.test.ts`

**Interfaces:**
- Produces: `COMMUNITY_MANAGED_PLUGINS: readonly ManagedPluginDescriptor[]`
- Produces: `UNAVAILABLE_COMMUNITY_RECOMMENDATIONS: readonly ManagedPluginRecommendation[]`
- Produces: trust-aware `getBundledManagedPluginRecommendations()`

- [ ] **Step 1: Write failing registry tests**

Assert the five accepted descriptors are installed after the twelve official descriptors and the three rejected identities are recommendation-only:

```ts
expect(COMMUNITY_MANAGED_PLUGINS.map(item => item.platform)).toEqual([
    "网易云", "QQ音乐", "酷我", "咪咕", "喜马拉雅",
]);
expect(UNAVAILABLE_COMMUNITY_RECOMMENDATIONS).toEqual([
    expect.objectContaining({ platform: "5sing", availability: "unavailable" }),
    expect.objectContaining({ platform: "酷狗", availability: "unavailable" }),
    expect.objectContaining({ platform: "汽水音乐", availability: "unavailable" }),
]);
```

Assert `isBundledManagedPluginPlatform` returns true for all eight community identities, while `getBundledManagedPlugin("5sing")` remains undefined.

- [ ] **Step 2: Run tests and verify RED**

Run: `./node_modules/.bin/jest src/core/pluginManager/managed/__tests__/ensureBundledManagedPlugins.test.ts src/core/pluginManager/managed/community/__tests__/communityPluginRegistry.test.ts --runInBand`

Expected: FAIL because the community registry does not exist.

- [ ] **Step 3: Implement immutable registries**

Freeze copied recommendation records. `BUNDLED_MANAGED_PLUGINS` becomes the official descriptors followed by the five community descriptors. The reserved platform set includes both bundled descriptors and unavailable community identities. Recommendation projection uses `trust: "official"` for the original twelve and `trust: "community"` for all eight new identities.

- [ ] **Step 4: Prevent repair/install of unavailable identities**

`repairBundledManagedPlugin` must return `{ success: false, message: "Managed plugin is unavailable" }` for unavailable identities without calling `ensureManagedPlugin` or any remote installer. Existing local/URL installation guards continue to reject exact managed names.

- [ ] **Step 5: Verify bootstrap ordering and failure isolation**

Update the existing expected startup list to contain 17 descriptors in deterministic order. Add a test where `QQ音乐` fails and `酷我` still installs. Assert default error logs contain only `{ platform, trust: "community" }` and no source, path, URL, or thrown message.

- [ ] **Step 6: Run tests and type checking**

Run: `./node_modules/.bin/jest src/core/pluginManager/managed --runInBand && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/pluginManager/managed/community/communityPluginRegistry.ts src/core/pluginManager/managed/ensureBundledManagedPlugins.ts src/core/pluginManager/index.ts src/core/pluginManager/managed/__tests__ src/core/pluginManager/managed/community/__tests__
git commit -m "feat: register community plugin defaults"
```

### Task 6: Reconcile Only Installable Recommendations

**Files:**
- Modify: `src/core/pluginCatalog/service.ts`
- Modify: `src/core/pluginCatalog/types.ts`
- Test: `src/core/pluginCatalog/__tests__/service.test.ts`
- Test: `src/pages/setting/settingTypes/pluginSetting/__tests__/usePluginCatalog.test.tsx`

**Interfaces:**
- Consumes: trust-aware `ManagedPluginRecommendation[]`
- Produces: reconciliation that skips `availability: "unavailable"`

- [ ] **Step 1: Write failing service tests**

Provide one bundled community recommendation and one unavailable recommendation. Assert `reconcileManagedRecommendations()` calls `repairManagedPlugin("网易云")` once and never calls it for `5sing`. Assert install requests for an unavailable catalog projection return a generic unavailable result without calling `installPluginFromUrl`.

- [ ] **Step 2: Run tests and verify RED**

Run: `./node_modules/.bin/jest src/core/pluginCatalog/__tests__/service.test.ts src/pages/setting/settingTypes/pluginSetting/__tests__/usePluginCatalog.test.tsx --runInBand`

Expected: FAIL because the service attempts to reconcile every recommendation.

- [ ] **Step 3: Filter reconciliation and retry paths**

Only recommendations with `availability === "bundled"` enter automatic reconciliation or managed repair. Preserve concurrent-call sharing through the existing `managedReconciliation` promise. Unavailable entries return `Managed plugin is unavailable` without network activity.

- [ ] **Step 4: Preserve immutable snapshots**

Ensure service accessors return new arrays and copied recommendation objects, including trust/availability metadata. Do not write community recommendations into the remote catalog cache.

- [ ] **Step 5: Run tests and type checking**

Run: `./node_modules/.bin/jest src/core/pluginCatalog/__tests__/service.test.ts src/pages/setting/settingTypes/pluginSetting/__tests__/usePluginCatalog.test.tsx --runInBand && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/pluginCatalog/service.ts src/core/pluginCatalog/types.ts src/core/pluginCatalog/__tests__/service.test.ts src/pages/setting/settingTypes/pluginSetting/__tests__/usePluginCatalog.test.tsx
git commit -m "fix: reconcile installable community plugins"
```

### Task 7: Add Community and Unavailable Plugin Library States

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
- Consumes: `managedTrust`, `managedAvailability`, and `status: "unavailable"`
- Produces: distinct official, community-installed, restoring, retry, and unavailable UI

- [ ] **Step 1: Write failing component tests**

Assert an installed community row renders `Community · Installed by MyMusic`, an unavailable row renders `Unavailable · No safe source`, and an unavailable row has no enabled action. Preserve `Installed · Recommended by MyMusic` for official rows. Assert a failed bundled community restoration renders `Retry`.

- [ ] **Step 2: Run tests and verify RED**

Run: `./node_modules/.bin/jest src/pages/setting/settingTypes/pluginSetting/__tests__/catalogPluginItem.test.tsx src/pages/setting/settingTypes/pluginSetting/__tests__/pluginLibrary.test.tsx --runInBand`

Expected: FAIL because community-specific copy and unavailable state do not exist.

- [ ] **Step 3: Add translations**

Add these keys in all three locales and declarations:

```text
pluginLibrary.status.communityInstalled
pluginLibrary.status.communityUnavailable
pluginLibrary.reason.noSafeSource
```

English values are `Community · Installed by MyMusic`, `Unavailable`, and `No safe source`. Use natural Simplified and Traditional Chinese translations.

- [ ] **Step 4: Implement deterministic UI states**

Official installed rows use `recommendedInstalled`; bundled community installed rows use `communityInstalled`; unavailable rows use `communityUnavailable` plus `noSafeSource`. Disable unavailable rows permanently. Enable Retry only when a bundled managed provider has a reconciliation error.

- [ ] **Step 5: Run UI and i18n tests**

Run: `./node_modules/.bin/jest src/pages/setting/settingTypes/pluginSetting/__tests__/catalogPluginItem.test.tsx src/pages/setting/settingTypes/pluginSetting/__tests__/pluginLibrary.test.tsx src/core/i18n/__tests__/index.test.ts --runInBand && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/setting/settingTypes/pluginSetting src/core/i18n/languages src/types/core/i18n/index.d.ts
git commit -m "feat: show community plugin status"
```

### Task 8: Document Provenance and Compliance Decisions

**Files:**
- Create: `docs/community-plugin-provenance.md`
- Modify: `README.md`
- Test: `src/core/pluginManager/managed/community/__tests__/communityPluginProvenance.test.ts`

**Interfaces:**
- Produces: machine-checked provenance table covering every community identity

- [ ] **Step 1: Write a failing provenance test**

Read the Markdown file and assert it contains all eight exact platform names, upstream commit `e88f5dea5ea7b2b60ccb3aae6823ca38ec71c5d0`, five accepted hashes, three rejection reasons, `GPL-3.0`, and the private/personal-use boundary.

- [ ] **Step 2: Run the test and verify RED**

Run: `./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__/communityPluginProvenance.test.ts --runInBand`

Expected: FAIL because the provenance document does not exist.

- [ ] **Step 3: Write the provenance document**

Document, per provider: displayed platform, trust tier, availability, upstream repository/path/commit, original SHA-256, MyMusic version, transformations, allowed hosts, license, live-check date, and rejection reason when unavailable. State that MyMusic does not guarantee provider availability or rights to content.

- [ ] **Step 4: Update the README minimally**

Add one short Plugins paragraph linking to the provenance document and explaining that official and reviewed community defaults are restored locally at startup; unavailable community rows are informational and execute no code.

- [ ] **Step 5: Run the provenance test and commit**

Run: `./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__/communityPluginProvenance.test.ts --runInBand`

Expected: PASS.

```bash
git add docs/community-plugin-provenance.md README.md src/core/pluginManager/managed/community/__tests__/communityPluginProvenance.test.ts
git commit -m "docs: record community plugin provenance"
```

### Task 9: Live Provider Validation and Release Verification

**Files:**
- Create: `src/core/pluginManager/managed/community/__tests__/liveCommunityProviders.test.ts`
- Modify if failures require safe fixes: `scripts/vendor-community-plugins.cjs`
- Modify generated outputs if failures require safe fixes: `src/core/pluginManager/managed/community/sources/*PluginSource.ts`

**Interfaces:**
- Consumes: five bundled community descriptors
- Produces: gated live evidence for mount, search, and authorized playback

- [ ] **Step 1: Add opt-in live tests**

Gate network calls behind `LIVE_COMMUNITY_PLUGIN_TESTS=1`. For each accepted provider, mount the real source, search a neutral query, assert a non-empty valid item when the service returns data, request standard-quality playback, and require an HTTPS URL on an approved host. Redact all provider response bodies and URLs from failure messages.

- [ ] **Step 2: Run focused unit tests with coverage**

Run:

```bash
./node_modules/.bin/jest \
  src/core/pluginManager/managed/community \
  src/core/pluginManager/managed/__tests__/ensureBundledManagedPlugins.test.ts \
  src/core/pluginCatalog \
  src/pages/setting/settingTypes/pluginSetting \
  --runInBand --coverage
```

Expected: PASS with at least 80% statement and line coverage in changed modules.

- [ ] **Step 3: Run live checks individually**

Run one provider at a time so a service outage is attributable:

```bash
LIVE_COMMUNITY_PLUGIN_TESTS=1 ./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__/liveCommunityProviders.test.ts --runInBand --testNamePattern='网易云'
LIVE_COMMUNITY_PLUGIN_TESTS=1 ./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__/liveCommunityProviders.test.ts --runInBand --testNamePattern='QQ音乐'
LIVE_COMMUNITY_PLUGIN_TESTS=1 ./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__/liveCommunityProviders.test.ts --runInBand --testNamePattern='酷我'
LIVE_COMMUNITY_PLUGIN_TESTS=1 ./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__/liveCommunityProviders.test.ts --runInBand --testNamePattern='咪咕'
LIVE_COMMUNITY_PLUGIN_TESTS=1 ./node_modules/.bin/jest src/core/pluginManager/managed/community/__tests__/liveCommunityProviders.test.ts --runInBand --testNamePattern='喜马拉雅'
```

Expected: PASS. If a provider fails because its direct compliant endpoint is no longer functional, move that provider to `UNAVAILABLE_COMMUNITY_RECOMMENDATIONS`, remove its executable descriptor, update provenance, and rerun all registry/UI tests. Do not add a relay, bypass, decrypted stream, or plaintext fallback.

- [ ] **Step 4: Run static verification**

Run:

```bash
npm run typecheck
npm run lint:check
git diff --check
git diff --cached --check
```

Expected: PASS with no unintended `yarn.lock` or duplicate-file changes staged.

- [ ] **Step 5: Build both platforms**

Run:

```bash
npm run build:android:debug
cd ios && bundle exec pod install && cd ..
npm run build:ios:simulator
```

Expected: Android debug APK and iOS simulator build succeed.

- [ ] **Step 6: Perform device smoke verification when available**

On Android and iOS: launch from a clean plugin directory, confirm five accepted community providers are installed before opening Plugin Library, confirm unavailable rows execute no code, restart to verify idempotence, search each accepted provider, and play one authorized/free result where returned.

- [ ] **Step 7: Run security and code review gates**

Review the full diff for hardcoded credentials, external relays, plaintext HTTP, dynamic evaluation, unsafe response logging, managed-identity replacement, and missing failure isolation. Resolve every CRITICAL/HIGH finding before completion.

- [ ] **Step 8: Commit final verification adjustments**

```bash
git add scripts/vendor-community-plugins.cjs src/core/pluginManager/managed/community docs/community-plugin-provenance.md src/core/pluginManager/managed/community/__tests__/liveCommunityProviders.test.ts
git commit -m "test: verify community plugin defaults"
```

Only create this commit when tracked verification adjustments exist; otherwise leave the verified task commits unchanged.
