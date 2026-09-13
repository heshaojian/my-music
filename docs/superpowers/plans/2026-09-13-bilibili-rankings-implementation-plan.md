# Bilibili Rankings Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore real, non-empty Bilibili rankings on iOS and Android.

**Architecture:** Patch the existing bundled Bilibili plugin at its anonymous-session and top-list boundaries. Keep official category endpoints, validate response envelopes, and rely on the managed-plugin lifecycle to upgrade installed copies.

**Tech Stack:** React Native, TypeScript, embedded CommonJS plugin source, Axios, Jest, Xcode, Gradle

**Spec:** `docs/superpowers/specs/2026-09-13-bilibili-rankings-design.md`

## Global Constraints

- Use only fixed official Bilibili HTTPS origins.
- Preserve the provider's real ranking categories.
- Never persist provider cookies or log their values.
- Keep search, playback, favorites, and unrelated plugins unchanged.
- Upgrade the managed plugin to `0.3.3-mymusic.1`.

---

### Task 1: Ranking Request Contract

**Files:**
- Create: `src/core/pluginManager/managed/__tests__/bilibiliTopLists.test.ts`
- Modify: `src/core/pluginManager/managed/bilibiliPluginSource.ts`

**Interfaces:**
- Consumes: `BILIBILI_MANAGED_PLUGIN.source`, Axios `get`, and `Date.now`
- Produces: tested behavior for `getTopLists()` and `getTopListDetail(item)`

- [x] **Step 1: Write failing tests for the current provider contract**

Assert that the SPI cookie is combined with `b_nut=<current Unix seconds>`, ranking detail requests use `https://www.bilibili.com/v/popular/rank/all/`, and a successful `data.list` maps to `musicList`.

- [x] **Step 2: Write failing response-boundary tests**

Assert that provider code `-352` throws a clear `Bilibili rankings unavailable (-352)` error, while a code-zero malformed payload returns an empty immutable list without crashing.

- [x] **Step 3: Run the RED suite**

Run: `npm test -- --runTestsByPath src/core/pluginManager/managed/__tests__/bilibiliTopLists.test.ts --runInBand`

Expected: FAIL because the cookie, referer, and error boundary are absent.

- [x] **Step 4: Implement the minimal session and ranking patch**

Patch `getCookieString()` to append the current `b_nut`, patch ranking requests to use the official ranking-page referer, validate numeric provider codes before mapping, and defensively read `data.list`.

- [x] **Step 5: Run the GREEN suite**

Run the Task 1 test command again. Expected: PASS.

### Task 2: Managed Upgrade and Live Verification

**Files:**
- Modify: `src/core/pluginManager/managed/bilibiliPluginSource.ts`
- Modify: `src/core/pluginManager/managed/__tests__/ensureBundledManagedPlugins.test.ts`
- Modify: `src/core/pluginManager/managed/__tests__/managedPluginLifecycle.test.ts`
- Modify: `src/core/pluginManager/managed/__tests__/liveManagedProviders.test.ts`

**Interfaces:**
- Consumes: `BILIBILI_MANAGED_PLUGIN` and the existing managed lifecycle
- Produces: bundled version `0.3.3-mymusic.1` and live ranking proof

- [x] **Step 1: Bump descriptor-coupled versions**

Change embedded and exported Bilibili versions to `0.3.3-mymusic.1`; update only tests that represent the real bundled descriptor.

- [x] **Step 2: Add the live ranking chain**

Load `getTopLists()`, select the first `排行榜` item, call `getTopListDetail()`, and assert that tracks are returned with valid identifiers.

- [x] **Step 3: Run focused and full verification**

Run focused Jest suites, the live Bilibili test, full Jest suite, typecheck, lint, Android debug build, and signed iOS build. Established lint warnings are permitted; new errors are not.

- [x] **Step 4: Install and inspect on iPhone**

Install and launch `com.heshaojian.FreeMusic` on device `0C14A9B0-7869-53D4-AA1C-9F76765FA3B0`; copy application Documents and verify the mounted Bilibili source is `0.3.3-mymusic.1` and contains the ranking-session patch.

- [x] **Step 5: Review and commit**

Run code/security review, secret scan, and `git diff --check`; commit only the Bilibili feature and its specification/plan.
