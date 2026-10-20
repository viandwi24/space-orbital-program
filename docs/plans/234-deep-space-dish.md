---
id: 234
title: "Deep-space dish: a large, realistic parabolic antenna building"
status: done
owner: "Worker C"
depends: [233]
phase: 7
created: 2026-10-19
updated: 2026-10-20
---

# 234 — Deep-space dish: a large, realistic parabolic antenna building

## Goal

The Space Center can build a deep-space dish (`stock.deep-space-dish`) that looks like a real deep-space network antenna in the 34–70 m class. It slowly tracks the active vessel, or a sky target when no vessel is active, and it acts as the high-tier comms node. The existing small `stock.tracking-dish` stays as the early tier.

## Context

- Owner request, 2026-10-19: "a big parabola like in the films, an exact and realistic version". ADR 0222 point 3.
- Today, `stock.tracking-dish` is a 2 × 2 generic `gen('dish')` model (`mods/stock/src/buildings.ts:130-139`). Site building visuals are in `packages/renderer/src/site-buildings.ts`.
- Comms nodes and ground stations: ADRs 0101, 0185 and following; plans 114–121.
- Building data and placement: ADRs 0097, 0115, 0123.

## Scope

**In:**
- The building definition: size about 8 × 8 cells; three levels that set range and data rate; cost, build days and upkeep on the scale of a top-tier building.
- A procedural model with:
  - a concrete pedestal and a stair tower;
  - a turntable alidade with an elevation bull gear;
  - a parabolic reflector (panel rings with seams) and a back-up truss;
  - a quadripod;
  - a hyperbolic subreflector and a feed cone;
  - a cable wrap;
  - warning lights.
- LOD for distant views.
- Azimuth and elevation tracking, driven by the target direction (the sim provides it). Rates are slow and realistic. The dish parks in stow when idle.
- The dish is a comms node with high gain.

**Out:**
- The build menu (plan 235).
- Branches (plan 236).

## Touches

- **Size:** L
- **Edits:**
  - `mods/stock/src/buildings.ts`
  - `packages/renderer/src/site-buildings.ts`, or a new `packages/renderer/src/site/dish.ts`
  - comms node stats in `mods/stock/src/comms.ts`
- **Shared contracts:** none new; it uses the building and comms-node data.

## Steps

1. Write the reference geometry in the plan Log: dimensions taken from public descriptions of 34 m and 70 m DSN-class antennas, scaled.
2. Model generator with LOD; renderer unit tests for its bounds and node count.
3. Tracking: a pure function from target direction to azimuth and elevation with slew limits, with tests.
4. Building data and the comms node stats; a test that it raises the link budget compared with the tracking dish.
5. A Chromium e2e: use the debug API to build the dish at the Space Center, then take a screenshot from 4 angles at the Space Center.

## Acceptance criteria

- [x] Renderer tests pass: the dish bounds stay within its footprint; the tracking function respects its slew limits and points within 0.5° at steady state.
- [x] A sim or core test passes: a vessel at Moon distance links through the dish with a higher data rate than through the tracking dish.
- [x] `e2e/deep-space-dish.e2e.ts` passes on Chromium, with 4 screenshots in the journal. `[manual]` The owner judges the realism (approved 2026-10-20).
- [x] `bun run check:affected` passes, and CI is green on `ready/234`.

## Docs checklist

- [x] STATUS, journal with screenshots, architecture notes on site buildings.

## Log

- 2026-10-19 — Created from the owner's manual test (ADR 0222).
- 2026-10-20 — Worker C refined to ready and claimed (claim/234). Checked against the code: buildings draw from `site-list.ts` generators merged into the site's material buckets (static); the station tier of a site is the highest `comms-node` capacity of its buildings, with ranges and dish apertures per tier in `SITE_STATION_RANGES` / `SITE_STATION_APERTURES` (core `comms.ts`); the tracking dish's three levels are tiers 1–3 with 10, 34 and 70 m apertures. The debug API has no building command, so the e2e places the dish through `send({ type: 'place-building' })` (Sandbox, no cost).
- 2026-10-20 — Reference geometry (step 1; sources in `docs/research/deep-space-dish.md`): a **64 m** reflector (the DSN's 64 m class, later 70 m) so the turning dish stays inside an 8 × 8 cell footprint (78 m usable); f = 22 m (f/D 0.34, depth 11.6 m); elevation axis 40 m above the ground, the vertex 2 m behind it; a 7 m hyperbolic subreflector 18 m in front of the axis on a quadripod; pedestal 9 m radius × 9 m; bearing towers ±14 m; slew 0.25°/s per axis; tracking from 6° elevation; stow at the zenith.
- 2026-10-20 — ADR 0228. Default: the tracking dish's apertures become 9, 12 and 18 m (they were 10, 34 and 70 m on a 20 m footprint) so the deep-space dish's 64, 70 and ≈99 m are the step up; one link-budget test moved by 20 log 0.9.
- 2026-10-20 — Evidence: `packages/renderer/test/site-dish.test.ts` 4 pass (every vertex within the 39 m circle and above the ground at 20 aims; far model under half the vertices; slew limits per step and within 0.5° at steady state; short way round; stow); `packages/sim/test/deep-space-dish.test.ts` 1 pass (≈17 dB more margin and a higher rate at the moon's distance); `check:affected --build --e2e e2e/deep-space-dish.e2e.ts` all passed in 340 s; four screenshots in the journal. The `[manual]` realism check is the owner's.
- 2026-10-20 — **Blocked on the owner** (`[manual]`, worker brief: Owner decisions): every automated criterion passes and the code is on main; the realism check is open. Checklist for the owner: look at the four screenshots in `docs/journal/234-deep-space-dish.md` (or build the dish at the Space Center in a Sandbox world: Build → Deep-space dish) and say whether the dish reads as a real deep-space antenna; anything to change goes into a new plan. The e2e line stays unticked only for its `[manual]` part.
- 2026-10-20 — The owner approved the dish's realism ("234 aman aja segera merge"); the `[manual]` check is closed and the plan is done. Merged by the coordinator.
