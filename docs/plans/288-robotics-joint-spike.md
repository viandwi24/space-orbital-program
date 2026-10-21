---
id: 288
title: "Robotics joint spike: can Rapier's motored joints carry our robotic parts? (benchmark and research only)"
status: in-progress
owner: "Worker E"
depends: []
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 288 — Robotics joint spike

## Goal

Measured answers to the gate of ADR 0262, before anyone builds robotics. Can `@dimforge/rapier3d-compat` 0.21 (our build) hold motored revolute and prismatic joints, as multibody joints and as impulse joints:

- deterministically;
- stably in a 6-joint chain;
- at a step cost we can afford?

The deliverable is a benchmark script, a research note and a journal entry with a verdict: **go multibody**, **go impulse**, or **no-go** (then ADR 0262 needs a superseding ADR). No product code changes.

## Context

- ADR 0262 (robotics: rigid groups joined by motored joints; this plan is its gate), ADR 0018 (one compound body per vessel), ADR 0004 (physics behind an adapter).
- Code: `packages/physics/src/rapier-backend.ts` (bodies, compound colliders, fixed `ImpulseJoint` via `RAPIER.JointData.fixed`, line ≈180), `packages/physics/bench/grouping.ts` (the bench style to copy: warm-up, timed steps, a drift measure), `packages/core/src/physics-backend.ts` (the interface; **do not change it here**).
- Rapier version: root `package.json` catalog `@dimforge/rapier3d-compat ^0.21.0`.
- Research: `refs/part-visuals-and-blueprints/parts-tracker.md` §7.3 and §8.1.
- Machine: suitable for the Linux worker (Agent 3). Headless Bun only: no browser, no build. Keep `MemAvailable` ≥ 25 % of `MemTotal` and the 1-minute load ≤ 4 before each run (worker brief).

## Scope

**In:** `packages/physics/bench/joints.ts` (new); a research note `docs/research/rapier-joints.md`; journal; ADR 0262 status line only if the verdict is no-go.
**Out:** any change to `packages/physics/src`, `packages/core`, `packages/sim`, parts or UI. Wheel suspension (ADR 0262 point 8 needs no joints).

## Design notes

The bench talks to Rapier directly (`import RAPIER from '@dimforge/rapier3d-compat'`, `await RAPIER.init()`), as the adapter does, so it can try both joint kinds without touching the interface.

**Scenarios.** Dt 0.02 s, gravity 9.81, 16 solver iterations as the adapter uses, 100 warm-up steps, then timed.

| Scenario | Setup | Measures |
|---|---|---|
| A. Hinge lift | Base body 2 t, fixed (or very heavy). A revolute joint about X. An arm of 1 t, 2 m long. Motor in position mode, target 0° then 90°. | Time to reach 90° within 0.5°. Overshoot. Hold error over 60 s. |
| B. Piston | A prismatic joint along Y carries 500 kg. Target 0 m then 1.5 m. | Same as A, in metres. |
| C. Rotor | A revolute joint in velocity mode. A 200 kg wheel disc. Target 60 rpm. | Rpm error after 5 s. |
| D. Chain | 6 revolute joints in a chain (alternating X and Z axes), 100 kg per link, 1 m links, all targeting 30°. A 5 kN sideways kick on the tip at t = 2 s. | End-effector drift from the target pose after 10 s. Whether it settles. |
| E. Determinism | Run D twice in one process, and in two processes. | Full state: positions, rotations and velocities of every body after 500 steps. Equal to the last bit? |
| F. Cost | D against one compound body with the same 7 colliders (today's vessel). | µs per step for each. |

Run A–F for **multibody** joints (`world.createMultibodyJoint`) and for **impulse** joints (`world.createImpulseJoint`) with `configureMotorPosition` / `configureMotorVelocity`. If the 0.21 JS API lacks a call, record which, and try the closest equivalent.

**Verdict rules.**

- **Go:** A and B hold within 0.5° / 1 cm. C is within 2 % rpm. D settles with drift under 1 cm. E is bit-identical in-process **and** across processes. F costs ≤ 3× the compound body (the M5 budget of ADR 0262 is measured later, on the M5).
- **Go, with notes:** only the cross-process determinism fails. Record it. Our saves resume from state, so in-process determinism is what the tests need.
- **No-go:** anything else fails for both joint kinds.

## Steps

1. Read the Rapier 0.21 JS API for joints and motors (typings in `node_modules/.bun/@dimforge+rapier3d-compat@0.21.0/…`, and the official docs). Record the URL, version and date in `docs/research/rapier-joints.md` and `docs/research/stack-versions.md`.
2. Write `packages/physics/bench/joints.ts`: scenarios A–F, both joint kinds, plain-text table output. Usage: `bun packages/physics/bench/joints.ts [multibody|impulse|all]`.
3. Run it under `nice` on the Linux worker. Paste the trimmed table into the journal, with the machine (CPU, RAM, OS).
4. Write the verdict in the research note and the journal. For go, list the API calls plan 282 will wrap (the `createRevoluteJoint`, `createPrismaticJoint`, `setJointMotor` and `getJointState` signatures of ADR 0262 point 2, mapped to Rapier calls). For no-go, write the superseding ADR as `proposed` and stop.
5. Update plan 282's Context with a link to the note. Change only its Context and Log, not its status.

## Acceptance criteria

- [x] `bun packages/physics/bench/joints.ts all` runs to the end on the Linux worker and prints the A–F table for both joint kinds (output in the journal).
- [x] `docs/research/rapier-joints.md` gives the version, the URLs, the API calls used and the verdict, with the numbers behind each rule.
- [x] No file under `packages/*/src`, `mods/` or `apps/` changed (`git diff --stat` in the journal).
- [x] `bun run typecheck` and `bun run docs:check` pass. Typecheck covers the bench if it is in the package's tsconfig; if it is not, say so in the journal.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/288-robotics-joint-spike.md` written.
- [x] Affected `docs/architecture/*.md` updated to match what shipped (none expected).
- [x] New ADRs written for any decision made here, linked above (only for a no-go): [ADR 0265](../decisions/0265-robotics-short-impulse-chains-kinematic-arms.md), proposed.
- [x] `docs/research/stack-versions.md` updated for anything looked up.

## Log

- 2026-10-21 — Split from plan 282 at the owner's request ("boleh pisahkan"), sized for the Linux worker (Agent 3). Ready: steps checked against `rapier-backend.ts`, the grouping bench and the Rapier version in the catalog.
- 2026-10-21 — Worker E (Agent 3, Linux): bench, research note and journal written. Verdict **no-go**: A, B, C and E pass for both joint kinds; D (6-joint chain: multibody diverges, impulse sags 104.5 cm) and F (13.2× and 5.8×) fail. ADR 0265 proposed (impulse joints, at most two in series, optional sub-steps, kinematic long arms); plan 282 Context and Log updated.
