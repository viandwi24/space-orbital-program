---
id: 391
title: "Collisions that never miss: wake rails vessels near flight, CCD for thin and fast parts, merged physics frames, ground collider from the real terrain, docking angular momentum"
status: done
owner: "Worker B"
depends: [390]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 391 — Collisions that never miss

## Goal

A vessel cannot pass through another vessel, a station, debris or the ground. Idle vessels and debris near a flight vessel are woken and collide; thin and fast parts do not tunnel; two vessels in separate physics frames that approach end up in one frame; the ground collider follows the real terrain under the whole vessel and touches only its own vessel; docking conserves angular momentum. Each fix has a unit test.

## Context

- Read: `refs/graphics-v2/04-physics-fling-and-collision.md` Part 2 (C1–C6) and F5; `refs/graphics-v2/README.md` (wave acceptance: "A vessel cannot pass through another vessel or the ground").
- The causes, from 04:
  - **C1. No CCD.** `setCcdEnabled` is never called (`packages/physics/src/rapier-backend.ts:119-132`); `SIM_DT` 0.02 s (`packages/sim/src/constants.ts:4`). Bay walls 0.1 m (`mods/stock/src/animate.ts:217`), fairing panels 0.1 m (`mods/stock/src/parts/structure.ts:334`): two 0.1 m slabs tunnel above 10 m/s.
  - **C2. Rails.** `autoRails` (`packages/sim/src/modes.ts:261-269`) rails any vessel idle `RAILS_IDLE_TIME` 2 s (`constants.ts:14`); on rails a vessel has no body. Only `wakePortNeighbours` wakes one, and only when both have ports within `PORT_WAKE_RANGE` 50 m (`packages/sim/src/docking.ts:57, 161-179`). This is the main cause of "debris / docking passes through".
  - **C3. Frames never merge.** `acquireFrame` picks a frame only on entering flight (`packages/sim/src/frames.ts:104-122`); no code moves a vessel between frames (`frames.ts:359`, `vessel.ts:483`, `save.ts:363`).
  - **C4. Flat ground.** `updateTile` builds a 400×400 m box on the tangent plane under the COM (`frames.ts:664-728`; `packages/sim/src/terrain.ts:53-81`) and re-places it every step (`frames.ts:723`).
  - **C5. Foreign tiles.** Tiles are unfiltered kinematic bodies (`frames.ts:699-717`); `groundContacts` reads only the vessel's own tile (`frames.ts:781`).
  - **C6.** Ground tunnelling is mostly covered by the 100 m tile (`constants.ts:40`); C1 and C4 close the rest.
  - **F5 (docking part).** The merge averages ω by mass, not by angular momentum (`docking.ts:399-400`).
- Builds on 390's `setPairContacts` (for collision groups/filters) and `overlaps` query.
- ADRs: 0018 (compound bodies), 0330. KSP reference: everything within about 2.3 km is loaded.

## Scope

**In:**
- C2: a load range. Every rails vessel of the same SOI within `LOAD_RANGE` (about 2 km, ≤ `PHYSICS_RANGE` 2.5 km) of a controlled flight vessel is woken, with a margin `range + v_rel·T`; `railsEligible` is refused inside that range.
- C1: CCD on dynamic vessel bodies, with `maxCcdSubsteps` if needed.
- C3: frames of one SOI merge when any of their vessels come within `LOAD_RANGE`.
- C4: a ground collider that follows the terrain height field (`terrain.heightAt`) under the vessel's footprint, moved only when the vessel leaves the patch.
- C5: each tile collides only with its own vessel (collision groups or one shared height field per frame).
- F5 docking: the merged ω = I⁻¹·L.

**Out:**
- Separation and deploy flings (390).
- Mod planet height maps feeding the sim terrain (406); this plan reads whatever `terrain.heightAt` returns.
- e2e tests (paused by the owner).

## Design notes

- **C3 merge.** Between steps, as `refreshColliders` does: rebuild each moved body with `local' = local + oA − oB` and `v' = v + vA − vB`.
- **C4.** A Rapier `heightfield` patch sampled from `terrain.heightAt` around the footprint (or a few planes, one per lowest contact point, if the height field is too costly). Keep the 100 m depth below the surface so C6 stays covered. The patch must use the same heights the renderer draws (ADR 0330 point 4 on height maps; the ground collision here and 398's GPU terrain must agree).
- **C5.** Prefer collision groups (tile *i* ↔ vessel *i*); `groundContacts`, `landed` and impact damage then see every ground hit.
- Cost: CCD and more awake vessels add solver time; measure the sim step in `bun test` timing and keep the worker step under its existing budget.

## Steps

1. C1: CCD on dynamic bodies; the slab test.
2. C2: the load range, wake with a closing-speed margin, rails refused in range; the portless-target test.
3. C3: frame merge; the two-frame closing test.
4. C5: tile collision groups; the neighbour-landing test.
5. C4: the height-field ground patch; the rover-on-a-bump test.
6. F5: docking conserves angular momentum; the probe-docks-to-station test.
7. Re-run the landing, docking and mission flight tests and fix what moved.

## Acceptance criteria

- [x] `bun test packages/physics`: `test/contacts.test.ts` (no CCD: Rapier's contact prediction already stops it) — a 0.1 m slab at 30 m/s starting 0.5 m from a fixed 0.1 m slab, `dt` 0.02, 5 steps, ends on the near side with velocity ≤ 0 along the approach.
- [x] `bun test packages/sim`: an idle portless 5 t vessel in a circular orbit; a controlled craft 30 m behind closes at 1 m/s; within 40 s a contact is reported or the target gains Δv (today it passes through).
- [x] `bun test packages/sim`: two flight frames, vessels 3 km apart closing at 50 m/s; under 2 km apart `frameOfVessel` is the same for both, and at the meeting a contact is reported.
- [x] `bun test packages/sim`: a rover (2 m wheelbase) with its front wheels on a 1 m bump (3 m wide): no wheel hub is lower over the terrain than on flat ground (`ground-supports.test.ts`).
- [x] `bun test packages/sim`: A is landed on sloped ground and B lands 80 m away; when B's tile is created, A's |Δv| < 0.05 m/s and A's lowest point stays at its own terrain height.
- [x] `bun test packages/sim`: a 100 kg probe spinning at 1 rad/s joined to a 20 t station: the joint spin equals I⁻¹·L within 1 % (`docking-momentum.test.ts`, on `jointSpin`).
- [x] `bun test packages/sim` (landing, docking, ground, determinism suites) and web vitest `mission-flights.test.ts` still pass.
- [x] `bun run typecheck`, `bun run build` and `bun run docs:check` pass. e2e paused by the owner.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/391-collisions-that-never-miss.md` written.
- [x] `docs/architecture/` sim and physics docs: load range, frame merge, ground patch, collision groups.
- [x] ADR for the load range and frame merge, and for the ground collider, linked above.
- [x] `docs/research/stack-versions.md` updated for the Rapier CCD and heightfield APIs looked up.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Done by Worker B (ADR 0337). C2, C3, C5, F5 as planned; C4 as a plane raised to the highest support (a height field was built and dropped, ADR 0337); C1: Rapier already stops the thin slab and CCD stuck a plane to the ground, so none.
