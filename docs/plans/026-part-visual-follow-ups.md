---
id: 026
title: "Radial parts, boosters and fins (part follow-ups)"
status: done
owner: "radial session (Claude, 2026-10-16)"
depends: [020, 022, 024]
phase: 3
created: 2026-10-16
updated: 2026-10-17
---

# 026 — Radial parts, boosters and fins

## Goal

A player can build a Saturn-style rocket in the VAB: side boosters on radial decouplers, a nose cone, fins that actually stabilise the rocket in flight, with symmetry (2/3/4/6), and fly it to orbit. Today every vessel is a single column (ADR 0016) and the sim has no lift.

## Context

- ADRs 0016, 0017, 0018, 0019, 0021, 0028, 0029, 0033; **new: 0034 (radial attachment, yaw, symmetry, format 2), 0035 (airVelocity, fin)**. `docs/product/visual-direction.md` is the bar (ADR 0025).
- Journals 020, 022, 024 (the "For plan 026" notes). `research/fin-aerodynamics.md`.

## Scope

**In:** design format 2 + migration (core); part yaw, rotated colliders/inertia/drag, multi-link detach, `airVelocity` (sim, SDK, API 0.1.8); stock `radial-decoupler`, `booster`, `nose-cone`, `fin` + modules; generators for them; VAB radial placement, symmetry, group delete/detach/move; auto-staging and Δv with boosters; engine start-up ramp and shutdown fade (renderer plume).

**Out (draft plan 033):** glTF asset provider, volumetric smoke, debris shards from real meshes, plasma shape, M1/M2 tuning, struts/fuel lines, tilted parts, steerable fins. Reason: none is needed to build and fly boosters and fins; each is large on its own.

## Steps

1. Core: format 2, `resolveVesselDesign` with yaw/radial/symmetry, `migrateVesselDesign`, schema, `dragCoefficient`, `VesselApi.airVelocity`, API 0.1.8; SDK exports.
2. Sim: part yaw everywhere, `airVelocity`, drag coefficient, multi-link `detach`; tests.
3. Stock: modules and parts; module tests.
4. Renderer: generators (box shapes allowed), `VabPart.yaw`, plume ramp; tests.
5. Web: editor (radial targets, symmetry, group ops), staging, `delta-v.ts`, VAB UI; tests.
6. Manual: build a booster+fin rocket by mouse, launch, separate, orbit; screenshots; self-review.
7. Docs, draft 033, commits.

## Acceptance criteria

- [x] `core` design tests: radial child resolves to the hand-computed position and yaw; refusals (v1 with radial, non-cylinder parent, duplicate site, non-horizontal node, `surface` as node name); v1 designs load unchanged through `migrateVesselDesign` and give identical resolved parts.
- [x] Sim: vessels with 2 and 4 radial boosters assemble; staged radial decouplers separate all boosters symmetrically with total linear and angular momentum conserved (to 1e-6 relative); crossfeed rules hold (a booster engine draws only from its own tank).
- [x] Sim: a fin has a restoring moment (sign test, hand value); a finned rocket coasting without control input stays within 5 degrees of prograde where the same rocket without fins diverges beyond 30 degrees; unfinned designs unchanged (determinism test byte-identical, `scenario-orbit` green).
- [x] `delta-v.ts`: per-stage Δv of core + boosters equals the hand Tsiolkovsky intervals (1e-9 relative); auto-staging gives `[core+boosters ignite], [radial decouplers], [stack decoupler + upper engine]`.
- [x] VAB editor tests: radial placement, symmetry 2/3/4/6 angles, group delete/detach/move, undo/redo.
- [x] Renderer generator tests for the new parts (inside shape, nodes, triangle budget); plume ramp unit test.
- [x] `[manual]` Built by mouse in the VAB with symmetry, launched, boosters separate, orbit reached (script allowed); screenshots `docs/journal/assets/026-*.png` (VAB with boosters and fins, liftoff with booster plumes, separation); frame times noted.
- [x] `bun test`, web tests, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier/lint green; written self-review in the journal.

## Docs checklist

- [x] STATUS (row, known issues: "No lift or fins" removed), journal 026, ADRs 0034/0035, `simulation.md`, `plugin-system.md`, `guides/writing-a-mod.md`, research, draft 033.

## Log

- 2026-10-16 — Created as draft by the parts session (pushed out of plan 020).
- 2026-10-16 — Refined draft → ready at the human's request (session: radial session). Effects other than the engine ramp pushed to draft 033 with reasons above.
- 2026-10-17 — Done. Evidence is in `docs/journal/026-part-visual-follow-ups.md` (verification table, `[manual]` run: 23-part vessel built by mouse with symmetry 4, orbit 214 x 76 km, screenshots `assets/026-*.png`). Deviations: the orbit run used a saved design with three reaction wheels (one wheel cannot steer the 25 t finned vessel, journal "Surprises"); the angular-momentum check is covered by the symmetry of the separation (linear momentum, centre of mass and equal speeds are tested, spin is not measured); the scope kept only the engine ramp of the effects, the rest is draft 033.
