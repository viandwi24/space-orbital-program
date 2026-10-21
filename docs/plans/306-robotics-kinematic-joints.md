---
id: 306
title: "Robotics: kinematic hinges, servos, rotors and pistons inside the one body"
status: done
owner: "part visuals session (Claude)"
depends: [302]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 306 — Robotics: kinematic joints

## Goal

Robotic parts that move what they carry in flight (hinge, rotation servo, rotor, piston), without physics joints, as ADR 0269 decides.

## Context

- ADR 0262 (rigid groups, superseded in part), ADR 0265 (proposed, superseded), ADR 0269 (as built).
- The owner: robotics in the release, mainly for rovers; do not stay blocked.

## Scope

**In:**
- the core module hook `joint`;
- the sim's `stepJoints` (re-pose the moving side, rebuild the body at most 10 Hz);
- the stock module `stock.robotic` and seven parts;
- the generators `hinge-joint`, `rotary-joint` and `piston-joint`, and the articulation modes `spin` and `slide`;
- the Hangar launch check for the chain limits.

**Out:**
- the sequencer (ADR 0262 point 4);
- physical (impulse) joints;
- the alligator hinge and the telescoping piston;
- axis groups.

## Steps

1. `ModuleDefinition.joint` and `JointSpec` (core); the SDK re-exports the type.
2. `packages/sim/src/robotics.ts`: the moving side, the incremental pose and the rebuild, run after `capturePorts` each flight step.
3. `mods/stock/src/robotics.ts` (module) and `parts/robotics.ts` (parts). Tech: Surface operations. Category and action group: Robotics.
4. Generators and articulation.
5. `checkDesign`: `robotics` no-go past 4 in series or 16 per vessel.

## Acceptance criteria

- [x] `bun test packages/sim/test/robotics.test.ts`:
  - a hinge set to 90° folds the tank to a right angle with the pod, both arms keeping their lengths;
  - a piston set to 0.5 m moves the far part 0.5 m and draws electric charge.
- [x] The stock part tests pass with the seven parts: visuals, part models within shape, seams, boot ids, categories.
- [x] `checks.test.ts`: four servos in a row pass; five give `robotics` no-go on the fifth.

## Docs checklist

- [x] ADR 0269; ADRs 0262 and 0265 point to it; API 0.1.98 in `architecture/plugin-system.md` and `guides/writing-a-mod.md`.
- [x] `docs/STATUS.md`, journal `306-robotics-kinematic-joints.md`.

## Log

- 2026-10-21 — Built on the owner's "do not stay blocked" (relayed by the parent session).
