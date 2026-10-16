---
id: 016
title: Landed vessels on surface-fixed rails
status: done
owner: ""
depends: [012, 013]
phase: 3
created: 2026-10-16
updated: 2026-10-16
---

# 016 — Landed vessels on surface-fixed rails

## Goal

A controlled vessel standing on the ground (the rocket on the pad, a lander after touchdown) stays in `flight` mode forever, so `warp` is refused on the pad and after landing ("time warp needs every vessel on rails"). Plan 013 only removes uncontrolled debris. Let a controlled vessel at rest on the ground go on rails in a surface-fixed state (it rotates with the planet, keeps its orientation relative to the ground), so a player can warp to wait for an orbital window, and wake it with the existing commands.

## Context

- Read: ADR 0024 (this plan's decisions: rails kind, rest rule, wake, snapshot), ADR 0021 (debris rules, why landed vessels were left out), ADR 0019 (ground tile, `landed`), ADR 0017 (modes), `architecture/simulation.md` (Vessel modes), `packages/sim/src/modes.ts`, `orbit.ts`, `snapshot.ts`, `frames.ts` (`enterFlight`).
- Journals: 013 (debris, the draft's origin), 012, 014 (part temperature needs no handling on rails).
- Questions answered by ADR 0024: surface `RailsState` kind (`'surface'`, body-fixed COM and orientation) vs a flag; snapshot position/orientation turn with the planet, no `orbit`, new `VesselSnapshot.surface`; wake on `throttle`/`stage`/`attitude`/`action` unchanged; 2 s of landed, force-free rest with speed and spin thresholds (the asymmetry rest-to-go-on / command-to-leave is the hysteresis); the vessel is re-placed from the stored pose with angular velocity `omega`, so it neither falls nor pops; the old "warp refused on the pad" test and its relatives are updated.

## Scope

**In:** surface rails (`RailsState` kind, rest tracking, `autoRails`, `wake`), snapshot (`surface`, orientation and velocity), `VesselSnapshot.surface` in core (additive, API 0.1.5), tests (pad vessel warps; a lander warps after landing; wake and launch still work), docs.
**Out:** terrain heights, slopes, tipping stability beyond "at rest" (speed and spin thresholds), multiple bodies, collisions with vessels on surface rails, web client/renderer changes (a "landed" label, hiding the orbit: report in the journal).

## Design notes

See ADR 0024. `RailsState` gains `{ kind: 'surface'; r; q }` (body-fixed); `VesselState.rest` counts landed, force-free, at-rest seconds; `trackRest` and `surfaceEligible` in `modes.ts`, `toSurfaceRails`; `orientationOf` and `surfaceRails` in `orbit.ts`; `enterFlight(core, id, frame, angular)`.

## Steps

1. Refine: ADR, measurable criteria (this document).
2. Core (additive): `VesselSnapshot.surface?: boolean`, `API_VERSION` 0.1.5.
3. Sim: rails kind, motion, orientation, rest tracking, `toSurfaceRails`, wake with angular velocity, snapshot, split handling.
4. Update the tests that asserted a pad vessel stays in flight; add `packages/sim/test/surface-rails.test.ts`.
5. Docs: `simulation.md`, glossary, STATUS, journal.

## Acceptance criteria

- [x] `bun test packages/sim/test/surface-rails.test.ts`: a twoStage vessel loaded on the pad is in flight at 1 s and `warp 10` is refused; at 4 s it is `on-rails` with `surface: true` and no `orbit`, exactly one `vessel:mode-changed` (`on-rails:at rest on the ground`), and `warp 10` is accepted.
- [x] Same file, co-rotation: after 1e5 s of warp, the root position in the body-fixed frame (snapshot position rotated by the inverse of `bodies[0].rotation`) is within 1e-6 m of its value before the warp, the orientation relative to the body-fixed frame within 1e-9 per quaternion component, the velocity relative to the rotating ground below 1e-6 m/s, while the inertial position moved by more than 100 km.
- [x] Same file, wake bounds: after 77 000 s of warp, `throttle` 0.01 (no engine lit) wakes it (`flight:throttle`); the root position differs from the rails pose by less than 1 mm and the velocity by less than 1e-6 m/s at the wake; over the next 8 s the body-fixed position stays within 2 cm of the start and the ground speed below 0.1 m/s; no `part:damaged`; 2 s later it is on surface rails again. `attitude`, `stage` and `action` wake it with their reasons; during warp > 1 waking is refused and changes nothing.
- [x] Same file, scenario: after 25 000 s of warp on the pad, the plan 007 scripted ascent (`createAscent`: `throttle` + `stage`) reaches a stable orbit (periapsis above 70 km, e < 0.1) in under 1200 s, with the plan 007 numbers (periapsis 76.18 km, e 0.0257, 217.6 s) within the same bounds as `scenario-orbit.test.ts`.
- [x] Same file, lander: the plan 012 lander flown from the 100 km orbit is on surface rails 5 s after `landing.phase === 'done'`, no `part:damaged`, `warp 1000` is accepted, after 5e4 s it is still within 1e-6 m of its body-fixed place with 6 parts, root altitude between 10 and 11.5 m.
- [x] Same file: an uncontrolled tank on the pad is not put on surface rails (ADR 0021 still removes it); with `maxFlightFrames: 1` a vessel far away can be loaded after the pad vessel went on rails; part temperatures stay at ambient during rails warp; two identical runs (pad, rails, warp, wake, rails) give byte-identical `snapshot()` and `world.serialize()`.
- [x] Existing sim tests (plans 007, 011, 012, 013, 014: `bun test packages/sim`) pass, the ones that asserted a pad vessel stays in flight having been updated and the change noted in the Log (`warp.test.ts` refusal is kept for the first 2 s).
- [x] Mutation check: rotating by `0.999999 * omega * t` in `railsMotion` makes the co-rotation, wake and lander tests fail (restored afterwards).
- [x] `bun run typecheck`, `bun run build`, `bun test` pass; `bun run docs:check` passes.
- [x] Boundaries: `grep -rn "node:\|Bun\.\|process\.\|Math.random\|Date.now\|performance.now" packages/sim/src` finds nothing; `git diff` of `packages/core` is additive only.

## Docs checklist

- [x] `docs/STATUS.md`, journal 016, `simulation.md` (vessel modes, time warp), ADR 0024, glossary.

## Log

- 2026-10-16 — Created as draft by plan 013 (landed controlled vessels still block time warp).
- 2026-10-16 — Refined draft → ready at the human's request (session: surface-rails session). ADR 0024 answers the open questions; the criteria above are measurable.
- 2026-10-16 — Started (in-progress); implementation written alongside the refinement, criteria run at the end.
- 2026-10-16 — Done. All criteria ran green (outputs in journal 016). Four existing tests that asserted a pad vessel stays in flight (`debris`, `ground`, `sim` pad drift, `sim` second vessel joins frame) were updated; `warp.test.ts` refusal unchanged (holds for the first 2 s). Found, not done: no colliders on rails (vessels pass through a parked one).
