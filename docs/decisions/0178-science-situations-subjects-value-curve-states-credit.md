# 0178 — Science core: situations, subjects, the value curve, experiment states and credit

**Status:** accepted
**Date:** 2026-10-17
**Plan:** 103
**Builds on:** ADR 0099 points 1, 2 and 6 (matrix, data and samples, presets), 0172 (data items), 0113 (ledger), 0110 (state beside the ECS world).

## Context

ADR 0099 sets the science matrix (experiment × body × situation × region) with caps and diminishing returns, results as data or samples, and states READY / RUNNING / PAUSED / INVALID. Open: what a situation is as data, the per-body thresholds, the exact value curve, when a value is fixed, where subjects live, which rule turns science points on, and how often the situation is computed.

## Decision

1. **Situations.** `defineSituation({ id, label, order, matches })`. `matches` is a pure function over `{ landed, splashed, altitude, atmosphereHeight, flyingHigh, spaceHigh }`, and the lowest `order` that matches wins. Ids are `<plugin>.<name>` like every definition. Stock, in order: `stock.landed`, `stock.splashed` (landed where the ground is at or below sea level on a body with an atmosphere), `stock.flying-low` (in the atmosphere below `flyingHigh`), `stock.flying-high`, `stock.space-low` (below `spaceHigh`), `stock.space-high`.
2. **Per-body thresholds** are body data: `science: { flyingHigh?, spaceHigh?, multiplier? }`. Defaults: `flyingHigh` is a quarter of the atmosphere height (0 without one), `spaceHigh` the larger of the atmosphere height and 0.4 × radius, `multiplier` 1. Stock: home 18 km, 250 km, ×1; moon 60 km, ×2.
3. **Subjects.** The id is `<experiment>@<body>:<situation>:global` (regions arrive with plan 104). A subject keeps `count` (results made), `produced` (value given to results) and `credited`.
4. **Value curve.** The n-th result (n from 0) is worth `min(cap − produced, base × multiplier × repeatFactor^n)`, with `cap = base × multiplier × capFactor` (default 3). The value is fixed **when the result is made**, so two runs in a row give two different values, and nothing a later run does changes an earlier result.
5. **Experiment module.** `stock.experiment` (config `{ experiment }`). The state is `READY`, `RUNNING` (`progress` 0..1 over `duration`, drawing `power` electric charge per second), `PAUSED` (power ran out: "no electric charge"), or `INVALID` ("not in an allowed situation: <now>; needs <list>", or "holds a sample"). The action `run` starts it. A finished data run stores a data item: kind `stock.science`, `bits`, `value`, `subject`, `meta.transmitFactor`. A finished sample run keeps the sample in the module, and the module stays `INVALID` until recovery.
6. **Situation cache.** `ctx.vessel.situation()` is computed at most once per second of sim time per vessel, and again at once after an SOI or landed change.
7. **Credit.** `transmit-data { vessel, item }` credits `value × transmitFactor` and deletes the item. It is direct until plan 119, whether comms is on or off. `recover-vessel` credits every science item aboard and every held sample, at full value. Credit adds to the subject's `credited`, and becomes a `science` ledger entry (`cause` `science.<experiment>`, `ref` the subject) × `stock.science-multiplier` when `stock.tech-tree` is on. Sandbox has no tree and no science currency (ADR 0099 point 6), but its subjects are still counted.
8. **Save and snapshot.** `SimSave.science = { subjects }` is optional in format 5, written once a subject exists. `Snapshot.science` lists the subjects. `VesselSnapshot.science` lists the experiments with `part`, `experiment`, `state`, `reason` and `progress`.

## Alternatives considered

- **Value fixed at credit** (KSP 1) — rejected: two identical results would then change value depending on which is credited first, and a stored item could not show its worth.
- **The economy rule as the gate** — rejected: it is Career only, and the Science preset has science without money.
- **Situation every step** — rejected for cost; one second is finer than any threshold crossing a player sees.

## Consequences

- **Mod API:** `defineExperiment`, `defineSituation`, body `science`, `VesselApi.situation()`; additive, `API_VERSION` patch bump. Load report kinds `experiment` and `situation`.
- **Protocol:** `transmit-data`, events `science:result` and `science:credited`, `Snapshot.science`, `VesselSnapshot.science`. **Script API:** `ship.science`, `runExperiment`.
