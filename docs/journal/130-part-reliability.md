# 130 — Part reliability

**Plan:** [plans/130-part-reliability.md](../plans/130-part-reliability.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0156](../decisions/0156-part-reliability-failure-modes-experience-grades-test-stand.md) (new), [0094](../decisions/0094-worlds-are-saves-modes-are-presets-over-rules.md), [0100](../decisions/0100-crew-a-full-simulation-every-aspect-a-world-rule.md), [0115](../decisions/0115-building-grid-placement-rules-and-the-legacy-layout.md), [0120](../decisions/0120-eva-the-suit-is-a-vessel-commands-walking-jetpack-flag.md) · **Research:** none

**Status when written: criteria met here.**

## What was done

| Where | What |
|---|---|
| `packages/core/src/reliability.ts` | `FailureModeDefinition` and schema, grades and their factors, `trialChance`, `modelReliability`, `SaveReliability`, `ReliabilitySnapshot`; registry `failureModes` (report kind `failure-mode`); commands `set-grade`, `static-fire`, `fix-anomaly`, `repair`; `SimSave.reliability?`; `Snapshot.reliability?`; event `part:failed`; API_VERSION 0.1.55 |
| `packages/sdk` | `defineFailureMode`; `GRADES`, `GRADE_FACTORS`, `trialChance`, `modelReliability` and the types |
| `packages/sim/src/reliability.ts` | trials at stage and at load from the `reliability` stream, failed modules skipped in the hooks, the authority, actions and comms, experience, reports, grades in the launch cost, static fire, fixes, EVA repair, save, snapshot |
| `mods/stock` | three failure modes, the `stock.test-stand` building, the `stock.career-engineering` preset |
| web | `lib/reliability/reliability-model.ts`, the `/test-stand` screen (grades, static fire, reports and fixes) linked from the Space Center, the reliability line on the Hangar's part card, the `part-failed` sim event and its toast |
| tests | sim `reliability.test.ts` (6), web `reliability/reliability-model.test.ts` (2), `toasts.test.ts` (+1), `space-center/model.test.ts` (+1) |

## What surprised me

- **No module needed to change.** Skipping a failed module's hooks gives every module a failure: an engine whose `onStage` is skipped never lights, a decoupler's charge never fires, and the engine's `update` (where thrust is applied) is skipped too.
- **The pad turns.** The first "no thrust" test compared positions three seconds apart and saw 520 m: the pad moves with the planet. It compares the distance from the centre now.
- **Experience changes the chance every trial,** so the rate test sums the stated chance of each of the 2 000 static fires and compares the count with that sum within 4 standard deviations, not with one fixed chance.
- **Grade and mass.** The plan asked for grades that trade cost and mass; mass is deferred (ADR 0156 point 5): the Hangar's Δv is computed without the world's state, so a heavier "proven" part would make it wrong.
- The protocol additions (`Snapshot.reliability`, `part:failed`) are filed as contract requests; the commands went to the append-only command union.
- Same environment notes as before: `sim-host-script-worker.test.ts` (2 vitest) fails on this machine on main too.
