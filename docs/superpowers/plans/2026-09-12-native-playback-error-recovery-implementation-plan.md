# Native Playback Error Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover one late native playback failure per source-resolution attempt through the existing safe cross-provider fallback.

**Architecture:** Keep matching and URL security in `crossProviderPlaybackFallback.ts`. Add a small dependency-injected recovery function for native errors, while `TrackPlayer` owns only the monotonically increasing attempt identifier and integrates the replacement with its queue.

**Tech Stack:** TypeScript, React Native Track Player, Jest, managed CommonJS plugin runtime.

**Spec:** `docs/superpowers/specs/2026-09-12-native-playback-error-recovery-design.md`

## Global Constraints

- Recovery is limited to one attempt for each source-resolution identifier.
- Provider order remains `Youtube`, then `Audiomack`.
- The original track remains the queue, UI, history, and persistence identity.
- Signed fallback URLs and request headers remain runtime-only.
- Recovery retains the existing eight-second deadline and cancellation checks.
- The three unrelated duplicate `* 2.*` files remain untouched and uncommitted.

---

### Task 1: Add repeatable live provider verification

**Files:**
- Create: `src/core/pluginManager/managed/__tests__/liveManagedProviders.test.ts`

**Interfaces:**
- Consumes: all twelve `ManagedPluginDescriptor` exports and the production CommonJS runtime signature.
- Produces: opt-in Jest suite enabled with `LIVE_MANAGED_PLUGIN_TESTS=1`.

- [x] **Step 1: Execute each managed source through the production function boundary**

The helper injects production dependencies, iOS or Android identity, and
environment-only credentials. It never prints returned signed URLs.

- [x] **Step 2: Compare the managed list with the live official manifest**

Run:

```bash
LIVE_MANAGED_PLUGIN_TESTS=1 npm test -- --runInBand src/core/pluginManager/managed/__tests__/liveManagedProviders.test.ts
```

Expected: catalog names exactly equal the twelve managed platform names.

- [x] **Step 3: Verify public providers against live services**

Expected: YouTube, Audiomack, Bilibili, Suno, and Udio resolve reachable media;
both lyrics providers return lyrics; MaoerFM and Yinyuetai return current search
data and safely classify their direct media.

- [x] **Step 4: Keep credentialed checks opt-in**

The Kuaishou, Navidrome, and WebDAV cases run only when their named environment
variables are present, so credentials never enter source control.

### Task 2: Specify native playback recovery with failing tests

**Files:**
- Create: `src/core/trackPlayer/nativePlaybackRecovery.ts`
- Create: `src/core/trackPlayer/__tests__/nativePlaybackRecovery.test.ts`

**Interfaces:**
- Consumes: `resolveCrossProviderPlaybackFallback` and `IPlugin.IMediaSourceResult`.
- Produces: `recoverNativePlaybackFailure(options, dependencies): Promise<boolean>`.

- [x] **Step 1: Write a failing successful-recovery test**

```ts
await expect(recoverNativePlaybackFailure({
    musicItem,
    qualityOrder: ["standard"],
    isStillCurrent: () => true,
}, dependencies)).resolves.toBe(true);
expect(dependencies.replaceSource).toHaveBeenCalledWith(
    fallback.source,
    musicItem,
    27,
);
```

- [x] **Step 2: Run the focused test and retain the missing-module failure**

```bash
npm test -- --runInBand src/core/trackPlayer/__tests__/nativePlaybackRecovery.test.ts
```

Expected: FAIL because `nativePlaybackRecovery.ts` does not exist.

- [x] **Step 3: Add failure and cancellation cases**

Cover no match, fallback rejection, progress lookup failure defaulting to zero,
and a current-track change after fallback resolution. Assert replacement never
runs in each unsuccessful case.

- [x] **Step 4: Implement the minimal recovery function**

```ts
export async function recoverNativePlaybackFailure(options, dependencies) {
    const position = await dependencies.getPosition().catch(() => 0);
    const fallback = await dependencies.resolveFallback({
        musicItem: options.musicItem,
        qualityOrder: options.qualityOrder,
        getPluginByName: dependencies.getPluginByName,
        shouldAbort: () => !options.isStillCurrent(),
    });
    if (!fallback || !options.isStillCurrent()) return false;
    await dependencies.replaceSource(fallback.source, options.musicItem, position);
    return true;
}
```

- [x] **Step 5: Run the focused tests**

Expected: all native recovery tests pass.

### Task 3: Integrate one-shot recovery with TrackPlayer

**Files:**
- Modify: `src/core/trackPlayer/index.ts`
- Test: `src/core/trackPlayer/__tests__/nativePlaybackRecovery.test.ts`

**Interfaces:**
- Consumes: `recoverNativePlaybackFailure`.
- Produces: one bounded recovery claim per `sourceResolutionId`.

- [x] **Step 1: Add failing guard tests**

Test a pure exported guard that permits an unclaimed positive attempt ID and
rejects the same ID after it has been claimed.

- [x] **Step 2: Add attempt state**

```ts
private sourceResolutionId = 0;
private nativeRecoveryAttemptedFor = -1;
```

Increment `sourceResolutionId` immediately before placing the proposed source
in the native queue. When the initial no-source fallback succeeds, assign the
same ID to `nativeRecoveryAttemptedFor`.

- [x] **Step 3: Recover before the existing error dialog**

In `Event.PlaybackError`, claim the current ID before awaiting network work.
Call `recoverNativePlaybackFailure` with current-track cancellation. Its
`replaceSource` dependency merges the safe source into the original music item,
sets quality, calls `setTrackSource(..., true, originalMusicItem)`, and restores
the previous position. Return from the handler on success; otherwise call the
existing `handlePlayFail()`.

- [x] **Step 4: Verify duplicate errors cannot loop**

Assert the guard rejects the already-claimed ID, including when the first
fallback or replacement fails.

### Task 4: Release verification

**Files:**
- Modify only lockfiles if native dependency resolution changes; none expected.

**Interfaces:**
- Consumes: all production and live test suites.
- Produces: pushed private branch and installable Android/iOS artifacts.

- [x] **Step 1: Run focused and full verification**

```bash
npm test -- --runInBand src/core/trackPlayer/__tests__/nativePlaybackRecovery.test.ts
npm test -- --runInBand
npm run typecheck
npx eslint src/core/trackPlayer/nativePlaybackRecovery.ts src/core/trackPlayer/index.ts
```

- [x] **Step 2: Run live public-provider verification**

```bash
LIVE_MANAGED_PLUGIN_TESTS=1 npm test -- --runInBand src/core/pluginManager/managed/__tests__/liveManagedProviders.test.ts
```

Expected: ten public/catalog cases pass; only credential-bound cases skip when
their environment variables are absent.

- [x] **Step 3: Build both platforms**

```bash
npm run build:android:debug
xcodebuild -workspace ios/MusicFree.xcworkspace -scheme MusicFreeNew -configuration Release -destination 'generic/platform=iOS' DEVELOPMENT_TEAM=GM4SSCNNUK CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY='Apple Development' build -quiet
```

- [x] **Step 4: Review and commit only intended files**

Use explicit paths, verify no credentials or duplicate `* 2.*` files are
staged, then commit with `fix: recover native playback source failures`.

- [x] **Step 5: Install and launch on the physical iPhone**

Install the signed app with `devicectl`, launch bundle
`com.heshaojian.FreeMusic`, and confirm the process remains alive. Audible
playback and lock-screen controls require a user-initiated play action.
