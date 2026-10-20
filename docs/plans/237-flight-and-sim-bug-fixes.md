---
id: 237
title: "Bug fixes from the release audit: heat warning, vessel type on undock, branch founding funds"
status: ready
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

- [ ] The heat toast uses 2000 K for a part without `maxTemperature`; test passes.
- [ ] A docked vessel's type survives undock and a save/load; test passes.
- [ ] After founding a branch in a world with no prior save, the funds spent are kept after the reload; test passes.
- [ ] `bun run check:affected` passes, and CI is green on `ready/237`.

## Docs checklist

- [ ] STATUS row, journal `docs/journal/237-flight-and-sim-bug-fixes.md`; remove the matching lines from STATUS "Known issues".

## Log

- 2026-10-20 — Created by the coordinator from the release audit; ready (each bug checked against main @ b2d2abb2). Owner order: fix before v1.0.0.
