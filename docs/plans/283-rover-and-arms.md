---
id: 283
title: "Rovers, part two: wheel suspension, an external seat, scanning arms, surface features, the drill remodel"
status: done
owner: "Worker B"
depends: [291, 303, 306, 307]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 283 — Rovers, part two: wheel suspension, an external seat, scanning arms, surface features, the drill remodel

## Goal

Rover wheels ride on a spring and damper with visible travel, a crew member can sit in an external seat, scanning arms (S/M/L) study rocks seeded on the ground and yield science, and the drill looks like a drill.

## Context

- Already done by plan 307 (b12c0e18): rover wheels S/M/L (with steering variants), the deck chassis `stock.rover-chassis`, wheel throttle and top speed, the Flight drive mode, and the Trailblazer Rover blueprint (`mods/stock/src/parts/rover.ts`, `packages/sim/test/rover.test.ts`, `wheel-motor.test.ts`).
- Already done by plan 303: the rover cab `stock.rover-cab` (`mods/stock/src/parts/missions.ts`). Plan 309: the Trailblazer drives off the pad (`apps/web/src/lib/editor/mission-flights.test.ts`).
- Not done: `ModuleWheel` (`mods/stock/src/modules.ts`) has no spring or damper; there is no external seat, scanning arm or surface feature; `stock.drill` (`mods/stock/src/bases.ts`) uses a plain cylinder and is hidden until plan 386.
- Plan 306 (ADR 0269) built kinematic robotic joints (`stock.robotic`); an arm may be built on them instead of a plain deploy animation.
- ADRs: 0262 point 8 (suspension is a force inside the one body; still stands), 0264 point 4 (scanning arms and surface features from the stone lattice, ADR 0068), 0269, 0317 (stats checked against counterparts), 0268 (English titles).

## Scope

**In:**
- Spring and damper at the wheel contact in `ModuleWheel`, with tweakables and visual travel.
- External seat part (a crew seat with no hull).
- Scanning arm parts S/M/L and the "study" action.
- Surface features: rocks seeded per biome from the stone lattice.
- Remodelled `stock.drill` generator.

**Out:** Deployed science stations (284); showing the drill in the catalogue again (386).

## Design notes

- Suspension is a force inside the single body (ADR 0262 point 8), not a joint.
- An arm is a deploy animation plus a sim check of reach to a feature, or a `stock.robotic` joint if that is simpler; record the choice in the journal.
- Features are deterministic from the body's seed, so tests and saves agree.

## Steps

1. Suspension model with tests.
2. Seat, arm and drill generators and parts.
3. Surface features and the arm's study action.

## Acceptance criteria

- [ ] A rover drives over a 0.3 m step at 5 m/s without leaving the ground for more than 0.5 s (sim test).
- [ ] A scanning arm in reach of a feature yields a science item; out of reach, none (sim test).
- [ ] `packages/sim/test/rover.test.ts` and the Trailblazer flight in `mission-flights.test.ts` still pass.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/283-rover-and-arms.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-24 — Done by Worker B (ADR 0354, API 0.1.128): wheel suspension (spring and damper, a hub as the bump stop), `vessel.nearestFeature`, the rock study and three scanning arms, the external seat, the drill's rig. Open: visible wheel travel, features on Home, the 0.3 m step (the ground is a plane), screens.
- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: wheels, chassis, drive mode and the Trailblazer (307), the rover cab (303) and the drive test (309) are done; this plan keeps suspension, the external seat, scanning arms, surface features and the drill remodel; depends on 307 (and 306 for arms).
- 2026-10-21 — No longer waits for robotics (owner: rocket parts first, rovers next, robotics last). Suspension is a force in the single body (ADR 0262 point 8); the scanning arm is a deploy animation.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
