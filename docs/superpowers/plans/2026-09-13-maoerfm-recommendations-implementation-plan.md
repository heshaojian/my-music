# MaoerFM Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore and harden the complete 猫耳FM recommendation and playback flow.

**Architecture:** Extend the existing bundled managed plugin without changing the Recommended UI. Fixed provider endpoints return defensively normalized immutable data, while all audio remains gated by the existing media-source validator.

**Tech Stack:** React Native, TypeScript, embedded CommonJS plugin source, Axios, Jest, Xcode, Gradle

**Spec:** `docs/superpowers/specs/2026-09-13-maoerfm-recommendations-design.md`

## Global Constraints

- Support both iOS and Android from the shared React Native plugin source.
- Permit only free 猫耳FM tracks and approved HTTPS Maoer media hosts.
- Do not trust direct media URLs from recommendation responses.
- Preserve transport failures while safely normalizing malformed successful payloads.
- Upgrade installed managed plugins to `0.1.6-mymusic.1`.

---

### Task 1: Recommendation Contract Tests

**Files:**
- Modify: `src/core/pluginManager/managed/__tests__/providerManagedPluginSources.test.ts`

**Interfaces:**
- Consumes: `MAOERFM_MANAGED_PLUGIN.source`
- Produces: executable expectations for `getRecommendSheetTags`, `getRecommendSheetsByTag`, and `getMusicSheetInfo`

- [x] **Step 1: Write failing surface and mapping tests**

Add assertions that the plugin exports the three methods. Mock the current grouped-tag payload, nested `pagination` sheet payload, and `info.sounds` detail payload; assert mapped tag/sheet objects and free-only tracks without a direct `url`.

- [x] **Step 2: Write failing boundary tests**

Cover malformed successful payloads, malformed rows, invalid tag/sheet/page values, transport-error preservation, safe artwork mapping, and `*.maoercdn.com` audio acceptance while rejecting HTTP, credentials, whitespace, localhost, and suffix-confusion hosts.

- [x] **Step 3: Run the RED suite**

Run: `npm test -- --runTestsByPath src/core/pluginManager/managed/__tests__/providerManagedPluginSources.test.ts --runInBand`

Expected: FAIL because the three recommendation methods are absent and Maoer CDN audio is rejected.

### Task 2: Secure Recommendation Implementation

**Files:**
- Modify: `src/core/pluginManager/managed/maoerfmPluginSource.ts`
- Modify: `src/core/pluginManager/managed/__tests__/ensureBundledManagedPlugins.test.ts`

**Interfaces:**
- Consumes: fixed Maoer endpoints and the existing `formatMusicItem`, `validMusicFilter`, `BASE_HEADERS`, and media validation path
- Produces: `getRecommendSheetTags(): Promise<IPlugin.IGetRecommendSheetTagsResult>`, `getRecommendSheetsByTag(tag, page)`, and `getMusicSheetInfo(sheet)`

- [x] **Step 1: Implement validated normalizers**

Add finite positive integer normalization, safe provider image normalization, and defensive array checks. Return new result objects and arrays for every request.

- [x] **Step 2: Implement the three fixed-origin requests**

Use `/malbum/recommand`, `/explore/tagalbum`, and `/sound/soundalllist`; read sheet pagination from `response.pagination`; map `worksNum` from `music_count`; filter detail tracks through `pay_type === 0`; omit provider `soundurl`.

- [x] **Step 3: Extend the media allowlist and bump the version**

Accept exact/subdomain matches for `missevan.com` and `maoercdn.com` only. Change both embedded and descriptor versions to `0.1.6-mymusic.1`, then update descriptor-coupled assertions.

- [x] **Step 4: Run the GREEN suite**

Run: `npm test -- --runTestsByPath src/core/pluginManager/managed/__tests__/providerManagedPluginSources.test.ts src/core/pluginManager/managed/__tests__/ensureBundledManagedPlugins.test.ts --runInBand`

Expected: PASS.

### Task 3: Live Provider and Platform Verification

**Files:**
- Modify: `src/core/pluginManager/managed/__tests__/liveManagedProviders.test.ts`

**Interfaces:**
- Consumes: mounted managed 猫耳FM plugin methods
- Produces: live proof for tags → sheets → tracks → resolved media

- [x] **Step 1: Add the live chain**

Execute the first available tag, sheet, free track, and media source. Assert non-empty results, no direct URL on sheet-detail tracks, HTTPS audio, and a successful ranged media request.

- [ ] **Step 2: Run live and full verification**

Run the focused live provider test, full Jest suite with coverage, typecheck, lint, Android debug build, and iOS simulator build. Expected: all commands pass; lint may contain only established warnings.

- [ ] **Step 3: Install and validate on iPhone**

Build and install the signed app on device `0C14A9B0-7869-53D4-AA1C-9F76765FA3B0`, launch `com.heshaojian.FreeMusic`, and verify the exact Recommended → 猫耳FM → tag → sheet → track flow with device logs. Expected: the tab is visible and at least one free track starts playback.

- [ ] **Step 4: Commit**

Review the diff for secrets and unrelated files, then commit only this feature as `fix: restore maoerfm recommendations`.
