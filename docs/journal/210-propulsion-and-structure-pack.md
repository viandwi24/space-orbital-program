# 210 — SRBs, launch clamps, vacuum engine, 2.5 m class, engine tweakables, basic science parts

**Plan:** [plans/210-propulsion-and-structure-pack.md](../plans/210-propulsion-and-structure-pack.md) · **Session:** Worker A, 2026-10-19 · **ADRs:** [0219](../decisions/0219-solid-motors-launch-clamps-held-experiments.md), [0203](../decisions/0203-ksp-grade-parts-pack.md), [0019](../decisions/0019-ground-tile-and-impact-damage.md) · **Research:** 03, 07, 09, 15a, 15d

## What was done

| Where | What |
|---|---|
| `mods/stock` | solid engine mode, thrust limiter, gimbal lock and limit; BST-1 solid, small and large SRBs; vacuum engine; 2.5 m tanks, engine, decoupler, heat shield; `stock.launch-clamp`; goo canister and materials bay (held results) |
| `packages/core` | `anchor` hook, `VesselApi.groundClearance`, `extend` articulation, save format 10 (BST-1), API 0.1.79 |
| `packages/sim` | flow `none` = the part itself; `holdAnchored` after the backend step; `groundClearance` |
| `packages/renderer` | `extend` articulation, launch-clamp generator |
| tests | `srb.test.ts`, `held-experiments.test.ts`, `launch-clamp.test.ts`, `bst1-migration.test.ts`, the save migration test, `booster-ascent` updated, `e2e/clamps-and-srb.e2e.ts` |

## What surprised me

- **Flow mode `none` reached nothing:** no part could burn solid fuel, so the first solid BST-1 flamed out at once. ADR 0203 already meant "its own part"; `sources` now returns the drawing part.
- **The solid BST-1 has less Δv** than the old liquid one (Isp 200 against 270), so the Saturn ascent test aims at a 120 km apoapsis instead of 200 km; both variants still reach orbit at about 77 km periapsis.
- **Two experiments in every situation doubled Home's science cap,** which broke the tech pacing test. Their base values are small and tier 3 costs rose by 40 until plan 231 rebalances.
- **Tests that need a liquid side booster** (fuel lines, asparagus, delta-v) use the new LB-1, the old BST-1's numbers under a new id.
- **Two more engine controls overflowed ADR 0174's 8 kB actions budget** for a 100-part vessel (8.9 kB); one gimbal limit slider (0 holds the axis) brings it to 7.4 kB.
- **The saved part keeps its module configs,** so the BST-1 migration rewrites the engine and container configs as well as the amounts.

## Decisions made (link ADRs)

- ADR 0219; the rest in the plan's Log.

## Open questions / follow-ups

- Plan 218: per-part settings in designs (the limiter and gimbal in the Hangar) and a clamp warning in the pre-flight report.
- Plan 231: tech placement of the new parts and the science values of the two experiments.

## Verification output

```
check:affected --build --e2e e2e/clamps-and-srb.e2e.ts: all passed in 302.4 s
  bun test (10 workspaces) 1747 pass, 0 fail; typecheck 11 workspaces + web clean
  e2e clamps-and-srb.e2e.ts (chromium): 1 passed
web vitest (CI=true, full): 153 files, 1126 pass
srb.test 5 pass (BST-1 burns about 33 s; 50 % limiter doubles it), launch-clamp.test 2 pass,
booster-ascent 2 pass (periapsis 77 km), save format 10 migration pass, bst1-migration pass
```
