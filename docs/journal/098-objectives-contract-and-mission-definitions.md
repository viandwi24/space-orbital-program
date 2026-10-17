# 098 — Objectives: the evaluator behind contracts and missions

**Plan:** plans/098-objectives-contract-and-mission-definitions.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-17), three-agent team mode · **ADRs:** [0175](../decisions/0175-objective-trees-scheduling-vessel-binding-and-save.md) (new), [0098](../decisions/0098-progression-economy-career-and-milestones.md), [0113](../decisions/0113-economy-core-ledger-costs-charges-recovery.md) · **Research:** none

**Status when written: criteria met here, handed over as `ready/098`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/objectives.ts` (new) | primitive, view, tree, contract and mission types and schemas; `evaluateObjectives`, `currentLeaves`, `nodeStatus`, `leavesOf` |
| `packages/core` | registries `objectives`, `contracts`, `missions`; `ctx` registrars; load-time check of every contract and mission leaf; `objective-start`; events; `Snapshot.objectives`; optional `SimSave.objectives`; `API_VERSION` 0.1.36 (110 took 0.1.35) |
| `packages/sim/src/objectives.ts` (new) | start, view, scheduling after steps, ticks and events, deadline, rewards and penalties, snapshot; wired into `sim.ts`, `commands.ts`, `snapshot.ts`, `save.ts` |
| `mods/stock/src/objectives.ts` (new) | seven primitives: reach orbit, land, reach altitude, enter SOI, flyby, return home, before |
| tests | `packages/core/test/objectives.test.ts` (6), `mods/stock/test/objectives.test.ts` (5), `packages/sim/test/objectives.test.ts` (5) |
| docs | ADR 0175, `plugin-system.md`, `simulation.md`, guide "Contracts, missions and objectives" |

## Numbers

- Headless ascent (two-stage, ascent options aiming at 95 km apoapsis and 85 km periapsis): `periapsis over 80 km at 230.48 s; objective done at 230.48 s`. The default ascent ends at a 76 km periapsis, which would never pass 80 km.

## Decisions

- **State beside the ECS world** (`SimSave.objectives`, optional), like economy and the world tick: no entity, so no shifted vessel ids, and no format bump. The field is written only once something was started, so every existing save and fixture is unchanged.
- **Evaluation after each step** for primitives that listen to `'step'` (orbit and altitude change with no event), after events for the rest, and on ticks for dates. The cost is O(active objectives).
- **A sequence step can advance several steps in one evaluation**, bounded at 64 rounds. A leaf whose step just opened is evaluated at the same time.
- **Any-vessel semantics** when no vessel is bound: plan 099 chooses the binding per contract.

## Follow-ups

- 099: offers, accept and decline, abandon, binding rules per template. 100: the story line on missions.
- 103, 114 and 128 add the sample, comms link and payload primitives.

## Verification output

See the `ready/098` tag message.
