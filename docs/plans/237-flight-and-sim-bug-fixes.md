---
id: 237
title: "Bug fixes from the release audit: heat warning, vessel type on undock, branch founding funds"
status: done
owner: "Worker C"
depends: []
phase: 7
created: 2026-10-20
updated: 2026-10-20
---

# 237 — Bug fixes from the release audit: heat warning, vessel type on undock, branch founding funds

**Size:** S

## Goal

Fix three bugs that the release audit of 2026-10-20 found in code on main, before v1.0.0.

## Context

The owner ordered these fixed before the release ("untuk bug bug benar segera buatkan plan docs dan eksekusi", 2026-10-20). The audit read main at 4281d931.

1. **The heat toast fires at half the limit.** `apps/web/src/lib/hud-controller.ts:681` reads `maxTemperature ?? 1000`. The sim fails a part with no `maxTemperature` at `DEFAULT_MAX_TEMPERATURE = 2_000` (`packages/sim/src/constants.ts:68`, plan 212).
2. **A vessel loses its type on undock.** `DockRecord` (`packages/sim/src/state.ts:218-238`) keeps the docked vessel's name, design, stages and control part, but not its `type` (`VesselState.type`, `state.ts:106`, plan 223). `restoreUndocked` (`packages/sim/src/docking.ts:362-406`) therefore cannot give it back. The undocked side falls back to `guessVesselType`, and a player's choice (e.g. Station or Relay) is lost.
3. **Founding a branch can lose the funds spent.** `routes/(world)/space-center/+page.svelte:~342-344` calls `worldSession.saveNow()` then `location.reload()`. In a world with no save yet, `saveNow` writes nothing, and the reload starts from the world's start state, so the founding cost is gone (journal 236:36).

## Scope

**In:** the three fixes above, each with a test.

**Out:** the founding reload itself (ADR 0229 keeps it); other audit gaps (missing features) go to later plans.

## Touches

- `apps/web/src/lib/hud-controller.ts`; import `DEFAULT_MAX_TEMPERATURE` from `@orbital/sim` (or core, wherever it is exported) instead of a literal.
- `packages/sim/src/state.ts` (`DockRecord.type?`), `packages/sim/src/docking.ts` (record at capture, restore on undock); the keeper's own type is unchanged.
- `apps/web/src/routes/(world)/space-center/+page.svelte` and/or `apps/web/src/lib/world-session.ts`: make `saveNow` write a save when none exists yet, or refuse to reload until one is written.

## Steps

1. Heat: use the sim's default limit in the HUD; a unit test in the hud-controller tests that a part with no `maxTemperature` at 1500 K raises no heat toast and at 1900 K raises the warning.
2. Undock: store the docked vessel's `type` in `DockRecord` at capture; `restoreUndocked` sets it back on the docked side (and leaves `home.type` as it was). Save stays compatible: the field is optional. Test in `packages/sim/test` (dock two vessels, set one to `station`, undock, both types survive a save/load round trip).
3. Branch funds: make sure founding writes a save before the reload. Unit or e2e: in a fresh Sandbox/Career world with no save, found a branch, and after the reload the funds are the start funds minus the founding cost.
4. `check:affected`, then the worker brief's hand-over and merge.

## Acceptance criteria

- [x] The heat toast uses 2000 K for a part without `maxTemperature`; test passes.
- [x] A docked vessel's type survives undock and a save/load; test passes.
- [x] After founding a branch in a world with no prior save, the funds spent are kept after the reload; test passes.
- [x] `bun run check:affected` passes, and CI is green on `ready/237`.

## Docs checklist

- [x] STATUS row, journal `docs/journal/237-flight-and-sim-bug-fixes.md`; remove the matching lines from STATUS "Known issues".

## Log

- 2026-10-20 — Created by the coordinator from the release audit; ready (each bug checked against main @ b2d2abb2). Owner order: fix before v1.0.0.
- 2026-10-20 — Worker C claimed (claim/237). Heat: the constant moved to core (`DEFAULT_MAX_TEMPERATURE`, re-exported by the sim) and the HUD reads it through `heatRatio`. Undock: `DockRecord.type`; the keeper's side keeps the combined vessel's type, whichever entity it is after the split. Branch funds: `saveNow` writes a save with no flight yet (starter design in the envelope, focus null); the autosave timer is unchanged.
- 2026-10-20 — The coordinator asked to check two release e2e failures (warp.e2e at 10 km, vessel-switch '['). A sim-level probe grants 10× at 10 km for every ask from 50× up; `cycleVessel`/`switchVessel` are unchanged since plan 221. No fix folded in: both look like load/timing (reported to the coordinator).
- 2026-10-20 — Evidence: `toasts.test.ts` (15 pass: 1500 K no warning, 1900 K the warning, a declared limit wins); `docking.test.ts` "the player types survive the dock, the undock and a save and resume"; `check:affected --build --e2e e2e/branch-sites.e2e.ts` all passed in 468 s (the e2e reads 2,850,000 funds after the founding reload in a world with no prior save). The first local run failed only the patch benchmark under load 14 (880 ms); the rerun passed.
