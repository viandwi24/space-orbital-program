---
id: 303
title: "The mission parts batch: 59 new parts and six famous-mission blueprints"
status: done
owner: "part visuals session (Claude)"
depends: [291, 302]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 303 — The mission parts batch

## Goal

The owner asked for every planned part at once ("generate semua partsnya itu langsung semua"), rocket parts first, then the blueprints of famous missions, checked with short tests only (no e2e). This plan records that batch. The family plans keep the remaining work:

| Plan | Delivered here | Still open there |
|---|---|---|
| 280 | power, comms, science, containers, surface-mounted, with deploy animations; old stack parts hidden | panels breaking in airflow; the Hangar "replace with the new part" notice |
| 281 | service bays, cargo bay with doors, payload petals, couplers 2/3/4, truss, hub, lattice interstage | refusing to decouple a payload inside a closed bay |
| 276 | engine plates of 5, 8 and 9 bells, a vacuum engine XL, the escape tower, SRB XL | engine presets (open frame, shroud), segmented SRB remodel, separatron, the headless abort test |
| 295 | orbiter nose and aft, delta wing, external tank, cargo bay | the orbiter glide test |
| 296 | descent and ascent stages, single leg | the headless landing and ascent tests |
| 297 | hab and lab modules, hub, truss, radiator, airlock, cupola, large arrays | the two-module docking test |
| 298 | satellite bus, telescope with door, magnetometer boom, observation and magnetometer experiments | the pointing condition on observation |
| 300 | 3-seat capsule with built-in chutes, descent and orbital modules, sphere and cone capsules, lander can, crew cabin, rover cab | the per-capsule re-entry and landing tests |
| 286 | six blueprints that build, resolve and pass the pre-flight checks | the Library (285) and headless mission flights |

## Context

- ADRs 0255, 0257, 0259, 0260, 0261, 0263; research `refs/part-visuals-and-blueprints/parts-tracker.md` §11.
- Plan 302 (part-support modules) and plan 301 (the `/dev/parts` viewer, used to check the models).

## Scope

**In:** the generators in `packages/renderer/src/parts/generators/` (`dyn.ts`, `power.ts`, `comms.ts`, `bays.ts`, `spacecraft.ts`, `shuttle.ts`, the engine-cluster centre bell, the capsule's built-in chutes); `mods/stock/src/parts/missions.ts`; the tech nodes; the experiments `stock.observation` and `stock.magnetometer` (high orbit only, keeping the tech pacing); `apps/web/src/lib/editor/missions.ts`; a fix to the Hangar's delta-v for solid boosters.
**Out:** the remainders in the table; robotics (ADR 0265 is still proposed); the Hangar UI for blueprints, which comes after plan 279's merge.

## Steps

1. Generators per family, then the parts, then the tech nodes, then the tests.
2. Check the models in the `/dev/parts` viewer.
3. Build the blueprints with the editor operations, then test them against `checkDesign`.

## Acceptance criteria

- [x] Every new part is registered, in a tech node, and passes the shape, seam and triangle-budget tests (`bun test mods/stock`, `packages/renderer/test/parts.test.ts`, `part-seams.test.ts`).
- [x] Each of the six blueprints builds, resolves and lifts off, with no blocking and no no-go pre-flight check (`apps/web/src/lib/editor/missions.test.ts`).
- [x] `bun run lint` (with another session's `.claude/launch.json` left out), `bun run typecheck`, `bun run test` and web vitest with `CI=true` pass; the two known script-thread failures are aside.
- [x] The models were checked by eye in `/dev/parts` (journal).

## Docs checklist

- [x] `docs/STATUS.md` updated.
- [x] `docs/journal/303-mission-parts-and-blueprints.md` written.
- [x] Affected docs: the family plans' Logs, the parts tracker.
- [x] New ADRs: none.
- [x] Research: nothing looked up.

## Log

- 2026-10-21 — Done on the owner's instruction (all parts now, short tests).
