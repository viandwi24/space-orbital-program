---
id: 282
title: "Robotics: rigid groups and motored joints, hinges, servos, rotors, pistons and the sequencer"
status: draft
owner: ""
depends: [291, 288]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 282 — Robotics: rigid groups and motored joints, hinges, servos, rotors, pistons and the sequencer

## Goal

A vessel with robotic parts splits into rigid groups joined by motored Rapier joints; hinges (incl. alligator), servos, rotors and pistons move real mass, draw EC, lock, and are driven from the panel, action and axis groups and a keyframe sequencer; vessels without robotic parts behave exactly as before.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0262
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** (the spike is plan 288; build on its verdict and API mapping) `PhysicsBackend` joint API and the mock; group split in the sim; rails lock; save; docking with groups; robotic parts and generators; sequencer part and timeline UI.
**Out:** Rover suspension and scanning arms (283).

## Design notes

Per ADR 0262. Gate: if the spike fails its numbers, stop and write a superseding ADR.

## Steps

1. Backend API, mock, tests.
2. Sim groups, rails lock, save, staging and docking rules.
3. Parts, generators, panel controls, sequencer.

## Acceptance criteria

- [ ] Every existing sim test passes unchanged (one group per vessel).
- [ ] A hinge lifts a 1 t arm to 90° and holds it within 0.5° for 60 s (sim test); determinism: two runs give identical states.
- [ ] Step cost of a 6-joint arm ≤ 0.5 ms on the M5 (journal).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/282-robotics-articulated-vessels.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — The joint spike moved to plan 288 (Linux worker); this plan starts only on its "go" verdict.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
