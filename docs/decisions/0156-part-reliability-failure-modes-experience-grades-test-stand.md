# 0156 — Part reliability: failure modes as data, experience per part model, grades, the test stand, repair

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [130](../plans/130-part-reliability.md)
**Builds on:** ADR 0094 point 3 (reliability is a world rule, off by default), ADR 0100 point 2 (an engineer repairs and improves reliability), ADR 0115 (buildings), ADR 0120 (EVA), ADR 0113 (the ledger), ADR 0176 (crew professions)

## Context

The `stock.reliability` rule exists (boolean, off) and does nothing. The plan asks for part models whose reliability grows with experience, failures drawn from the sim PRNG so replays match, quality grades, a test stand with static fires, anomaly reports with fixes, and repair by an EVA engineer. Modules are code (`defineModule`); the sim calls their `update`, `onStage`, `actions`, `controlAuthority` and `antenna` hooks.

## Decision

1. **Failure modes are data** (`defineFailureMode` in the SDK, registry `failureModes`): `{ id, label, module, trigger, chance, repairable, description? }`. `module` is a module id; `trigger` is `stage` (drawn when a part with that module is staged) or `launch` (drawn when a vessel carrying it is loaded); `chance` is the probability per trial of a new, standard part model. Stock: engine shutdown at ignition (`stock.engine`, stage, 8 %), decoupler stuck (`stock.decoupler`, stage, 5 %), antenna dead (`stock.antenna`, launch, 4 %), all repairable but the decoupler.
2. **A failed module stops working.** The sim keeps the failed `(part, module, mode)` list in the world's reliability state. A failed module's `update`, `updateOnRails`, `onStage` and `controlAuthority` hooks are not called, its actions are refused and described as disabled with the reason `Failed: <mode>`, and a failed antenna counts as switched off. No module needs to know about reliability.
3. **Experience per part model, per world.** Every trial (a draw at a trigger, or a static fire) adds 1 to the part model's experience, failed or not. The chance of a trial is `chance × grade × learning × crew × fixes`: learning `1 / (1 + experience / 5)`, at least 0.2; crew 0.75 when an engineer is aboard the vessel; fixes `0.5^n` for the anomaly fixes bought for that model and mode (at most 3). A model's reliability shown to the player is the product of `1 − chance` over its modes at the next trial.
4. **Draws come from one stream** (`reliability`, seeded `streamSeed(world seed, 'reliability')`, state saved). With the rule off nothing is drawn, so no other system's draws move and a world plays as before. The same save and the same commands give the same failures.
5. **Grades trade cost for reliability.** Per part model per world (`set-grade { part, grade }`): `economy` (cost × 0.75, chance × 2), `standard`, `proven` (cost × 1.5, chance × 0.5). The launch charge adds the grade's part of each part's cost. Mass is not changed: the Hangar's Δv would have to read world state it does not have (deferred).
6. **The test stand** (stock building `stock.test-stand`, provides `test-stand`): `static-fire { part }` needs one in the world, costs a quarter of the part's cost (with the economy on), runs one trial of every mode of that model and adds experience.
7. **Anomaly reports.** Every failure writes a report `{ id, part, mode, time, vessel? }`. `fix-anomaly { report }` pays twice the part's cost and adds a fix for that model and mode (point 3). `repair { suit, vessel, part }` clears a repairable failure when the suit carries an engineer within 50 m and 2 m/s of the vessel (the boarding limits of ADR 0120).
8. **What the page sees.** `Snapshot.reliability` (absent with the rule off): the part models with modes (experience, grade, reliability), the open reports and the failed modules. Event `part:failed { vessel, part, module, mode, time }`. The stock preset `stock.career-engineering` is Career with reliability on.

## Alternatives considered

- **Failure effects as module hooks** (`onFail` per module) — every module, stock or mod, would have to implement failure; skipping the hooks of a failed module gives every module a failure for free.
- **Grade on the design part** — a vessel design format change (a shared contract) for a world setting; a grade per part model per world is what an agency buys.
- **Experience only from successful flights** — needs a definition of success per part; a trial teaches whether it fails or not, and a failure writes the report the player learns from.

## Consequences

- With the rule off the sim does no extra work beyond one rule read per stage and load.
- Mods add failure modes for their own modules (or for stock ones) as data.
- API: registry `failureModes`, `defineFailureMode`, commands `set-grade`, `static-fire`, `fix-anomaly`, `repair`, `Snapshot.reliability?`, event `part:failed`, `SimSave.reliability?` (optional in format 5). The snapshot field and the event are contract requests (plan 130 Touches names SDK and save).
