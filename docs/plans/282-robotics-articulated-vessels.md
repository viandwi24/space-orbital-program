---
id: 282
title: "Robotics, part two: the sequencer, the alligator hinge, the telescoping piston and axis groups"
status: done
owner: "Worker C"
depends: [306]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 282 — Robotics, part two: the sequencer, the alligator hinge, the telescoping piston and axis groups

## Goal

On top of plan 306's kinematic joints, a sequencer part plays keyframe tracks for a vessel's robotic parts, an alligator hinge and a telescoping piston join the robotics parts, and axis groups let a key pair or a stick axis drive a joint.

## Context

- Already done by plan 306: robotics as ADR 0269 decides. Every joint is kinematic inside the vessel's one body (no Rapier joints); `ModuleDefinition.joint`, the sim's `packages/sim/src/robotics.ts`, the module `stock.robotic` (`mods/stock/src/robotics.ts`) and seven parts (`mods/stock/src/parts/robotics.ts`: hinge S/M, servo S/M, rotor S, piston S/M); the launch check of 4 in series and 16 per vessel.
- ADR 0269 supersedes ADR 0262 points 1, 2, 5 and 7 and replaces ADR 0265. ADR 0262 point 4 (the sequencer) and the alligator hinge, telescoping piston and axis groups of point 3 are left; plan 306 lists them as Out. No sequencer or axis groups exist in the code yet.
- ADRs: 0262 (points 3 and 4), 0269, 0233 (action groups and custom slots), 0317 (stats checked against counterparts), 0268 (English titles).
- Code: `packages/renderer/src/parts/generators/robotic.ts`, `mods/stock/src/robotics.ts`, `packages/sim/src/robotics.ts`.

## Scope

**In:**
- The sequencer: a controller part with keyframe tracks per joint (play, loop, ping-pong), bound to action groups; a timeline panel in Flight and in the Hangar; saved with the design and the vessel.
- The alligator hinge (two leaves, hinge at the edge) and the telescoping piston (several stages), using the existing `joint` hook.
- Axis groups: a joint's target follows a key pair or an analogue axis, set in the Hangar's group editor.

**Out:** Physical (impulse) joints; reaction torque and rotor thrust (ADR 0269 point 5); rover suspension and arms (283).

## Design notes

- Keyframes set each joint's target; the joint moves at its own speed as now, so the sequencer adds no new physics.
- Axis groups extend the design's group data additively; old designs load unchanged.
- If a decision is needed beyond ADR 0262 point 4 (for example the track format), write an ADR first.

## Steps

1. Sequencer module, part and save data, with sim tests.
2. Timeline panel in Flight and the Hangar.
3. Alligator hinge and telescoping piston generators and parts.
4. Axis groups in the design, the input map and the group editor.

## Acceptance criteria

- [ ] A sequencer with a two-keyframe track moves a hinge to 90° and back within its timing in a looped play (sim test); two runs give identical states.
- [ ] A telescoping piston extends to its full length and an alligator hinge folds to its limit (sim tests).
- [ ] An axis-group binding moves a servo's target with the axis (web test).
- [ ] Every existing robotics test (`packages/sim/test/robotics.test.ts`, `checks.test.ts`) passes unchanged.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new part (catalogue icon and in the Hangar) and of the timeline panel in the journal.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/282-robotics-articulated-vessels.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-24 — Done in part (Worker C, ADR 0348): the sequencer (a `drive` hook in core and the sim, API 0.1.125), the alligator hinge, the long-reach piston, `setAxis` and the Hangar's track editor. Left: the axis groups' key and stick binding, a timeline panel in Flight; journal 282.
- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: plan 306 built robotics per ADR 0269; this plan is now a follow-up for the sequencer, the alligator hinge, the telescoping piston and axis groups; depends on 306, no longer on the 288 spike.
- 2026-10-21 — Plan 288's spike: no-go for ADR 0262 as written (no multibody motors in Rapier 0.21 JS; a 6-joint impulse chain sags and costs 5–6× at dt 0.02). ADR 0265 is proposed; this plan waits for its decision.
- 2026-10-21 — The joint spike moved to plan 288 (Linux worker); this plan starts only on its "go" verdict.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
