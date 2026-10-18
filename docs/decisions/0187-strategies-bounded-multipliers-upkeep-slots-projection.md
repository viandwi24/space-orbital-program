# 0187 — Strategies: declared multiplier keys with bounds, upkeep as a charge, slots, cooldown and the projection

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 101
**Builds on:** ADR 0098 point 5 (strategies change multipliers within stated bounds, with ratio, cap, an N-day projection and upkeep shown first), 0096 point 5 (the agency type picks the strategies on offer), 0113 (ledger, charges, `projectBalances`), 0123 (capacity key `admin`: strategy slots).

## Context

Plan 101 adds strategies that the player activates in Administration. Open questions:

- what a multiplier key is, and where each one acts in the sim;
- how two strategies on one key combine without passing its bounds;
- what upkeep is;
- where the slots come from;
- what happens after a strategy ends;
- how the projection before activation can match what the sim then does.

## Decision

1. **Multiplier keys are declared in core** (`STRATEGY_KEYS`), each with a label, a `min` and a `max`, and one place it acts:

   | Key | Where it acts | Bounds |
   |---|---|---|
   | `launch-cost` | the launch price, after `stock.cost-multiplier` | 0.75 to 1.25 |
   | `recovery` | the recovery credit | 0.75 to 1.5 |
   | `science` | science credited by experiments, and science in contract and mission rewards | 0.5 to 1.5 |
   | `reputation` | positive reputation in contract and mission rewards | 0.5 to 1.5 |
   | `contract-funds` | positive funds in contract rewards and advances | 0.5 to 1.5 |
   | `budget` | charges that name `multiplier: 'budget'` (stock: the government budget and the public grant) | 0.8 to 1.2 |

   A mod cannot add a key: each key needs a place in the sim where it acts.
2. **Strategies.** `defineStrategy({ id, label, description, effects, upkeep, agencyTypes?, cooldownDays? })`.
   - **`effects`** is a list of `{ key, factor }`. Load-time validation fails a strategy whose factor lies outside its key's bounds (the plan's design note), or that names an unknown key.
   - **`upkeep`** is funds per 30 days (positive, booked negative).
   - **`agencyTypes`** limits the offer to those values of `stock.agency-type` (default: all).
   - **`cooldownDays`** (default 30) is how long an ended strategy stays out before it can be activated again.
3. **Combining.** A key's multiplier is the product of the active strategies' factors on it, clamped to its bounds. So two strategies never take a key past its cap. The snapshot shows each key's value.
4. **Upkeep is a charge.** Each active strategy contributes a charge `{ id: <strategy id>, currency: 'funds', amount: −upkeep, everyDays: 30 }`, applied on the world tick like every other charge. `projectBalances` gains an optional `{ multiplier, extra }`: the key lookup for charges that name one, and extra charges. The projection the screen shows before activation is `projectBalances` with the strategy added, and the sim runs the same charges, so the two agree to the funds unit.
5. **Slots** are the primary site's `admin` capacity (stock Administration). A site without one has no limit.
6. **Commands.**
   - `strategy-activate { strategy }` refuses, with the reason, in these cases: no economy, an unknown strategy, a strategy not offered to this agency type, one already active, one still cooling down, or full slots (naming the upgrade that lifts them).
   - `strategy-end { strategy }` ends an active strategy and starts its cooldown.
   - Neither books anything at once: upkeep comes on the charge days.
7. **Snapshot and save.**
   - **Snapshot:** `Snapshot.strategies = { slots, used, multipliers, offered }`. `offered` lists, for each strategy this agency type may take, its effects with each key's bounds, its upkeep, whether it is active, and the time its cooldown ends.
   - **Save:** `SimSave.strategies = { active: [{ id, since }], cooldowns: [{ id, until }] }`, optional, so no format bump.
8. **Stock strategies** (six):

   | Strategy | Effects | Upkeep | Agency types |
   |---|---|---|---|
   | Reuse first | recovery ×1.25, launch cost ×1.05 | 1 500 | all |
   | Science first | science ×1.25, contract funds ×0.85 | 1 000 | all |
   | Public outreach | reputation ×1.3 | 3 000 | government, hybrid |
   | Lean operations | launch cost ×0.9, reputation ×0.85 | 2 000 | company, hybrid |
   | Commercial contracts | contract funds ×1.2, science ×0.8 | 1 500 | company, hybrid |
   | Budget lobbying | budget ×1.1, reputation ×0.9 | 1 000 | government |

   The career bot runs ten years with each one active that its agency type allows, and stays in the band.

## Alternatives considered

- **Additive bonuses (+25 %):** rejected. Products clamp cleanly and read as ratios ("×1.25"), which is what the plan asks the screen to show.
- **Mod-defined keys:** rejected (point 1). A key that nothing reads would be a promise the sim does not keep.
- **An activation fee** (KSP's setup cost): deferred. The plan names upkeep only, and a fee would need a projection term of its own.

## Consequences

- **Mod API:**
  - `defineStrategy`, `ctx.strategies`, report kind `strategy`;
  - `STRATEGY_KEYS`, `strategyMultipliers`, `strategyUpkeepCharge`;
  - `ChargeDefinition.multiplier`, and `projectBalances`'s options.

  All additive, with an `API_VERSION` patch bump.
- **Protocol:** the commands `strategy-activate` and `strategy-end`, and `Snapshot.strategies`.
- **Save:** an optional field.
- **Follow-ups:**
  - the director layer (programmes, board, insurance, staff);
  - an activation fee;
  - strategies of agencies (126).
