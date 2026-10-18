# 0186 — Procedural contracts: templates, the offer generator, slots, expected value and the save

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 099
**Builds on:** ADR 0098 point 4 (one evaluator, procedural contracts from templates with the seeded PRNG), 0175 (objective trees, contracts as data, binding, the save), 0113 (ledger), 0123 (capacity keys: `mission-control` is active contracts), 0171 (world tick and its PRNG streams).

## Context

Authored contracts (`defineContract`) exist since plan 098, but nothing offers them. Plan 099 asks for contracts generated from templates: few but meaningful, each with an advance, a reward, a penalty and a deadline (tied to transfer windows where that matters), and its expected value shown. The player accepts, declines or cancels within contract slots. Open questions:

- what a template is;
- when offers appear, and how many;
- where a generated contract lives, since it is not in a registry;
- what binds it to a vessel;
- which building gives the slots;
- how the expected value is estimated in the sim, which knows no Hangar library;
- what is saved.

## Decision

1. **Templates.** `defineContractTemplate({ id, label, tier, minReputation?, weight?, maxOffers?, cooldownDays?, generate })`:
   - `tier` (1, 2 or 3) is the prestige;
   - `minReputation` gates the template (default 0, 100 and 300 for tiers 1 to 3);
   - `maxOffers` is the anti-flood rule: at most that many of its offers at once (default 1);
   - `cooldownDays` (default 15) keeps a declined offer's `key` out for that many days.

   `generate(ctx)` is pure. It gets `{ random, home, bodies, reputation, time, day, dayLength, window }`:
   - `random()` draws in [0, 1) from the generator's stream;
   - `bodies` lists `{ id, label, parent, radius, mu, a }`;
   - `window(target)` gives the next transfer window to a sibling of the home body (point 6).

   It returns `null` or a blueprint: `{ key, title, brief, objectives, advance, reward, penalty, deadline, deltaV }`.
   - `objectives` is an ADR 0175 tree;
   - money is ledger entries;
   - `deadline` is in seconds from acceptance;
   - `deltaV` is the template's estimate of the mission's Δv, in m/s.

   Parameter ranges are the template's own code drawing from `random`. Templates are registered with `ctx.contractTemplates`.
2. **The generator runs on the world tick** with the economy on and the rule `stock.contracts` on (default on; ADR 0111).
   - **Expiry:** offers expire after `CONTRACT_OFFER_DAYS` (10) days.
   - **Cap and pace:** while there are fewer than `CONTRACT_OFFER_CAP` (5) offers, one tick makes at most one new offer. So offers are few, and they come at a pace.
   - **The pick:** weighted by `weight` (default 1) among the templates that pass their reputation gate and have room under `maxOffers`. A draw that returns `null`, or whose `key` is already offered, active or cooling down, makes nothing that tick.
   - **The stream:** its own PRNG stream (`streamSeed(seed, 'contracts')`), saved, so the same seed and the same commands give the same offers.
3. **Generated contracts live in the sim's contract state.** An offer is `{ id: 'gen.<n>', template, tier, key, title, brief, objectives, advance, reward, penalty, deadline, estimate, offeredAt, expires }`.
   - **Accepting it** starts an ordinary objective instance with source `{ kind: 'contract', id: 'gen.<n>' }`. The objectives engine resolves that id from the contract state before the registry.
   - **Everything else is ADR 0175:** reward, penalty, deadline and events.
   - **Binding:** generated contracts are unbound (ADR 0175 point 4): any vessel may do the work. Only vessels launched after the acceptance count, though. The instance keeps `since`, the highest vessel entity id at the start, and its view holds only vessels with a higher id. Otherwise a satellite already in orbit would finish every orbit contract the moment it is accepted.
4. **Commands.**
   - `contract-accept { offer }` checks the slots, pays the advance (cause `contract.advance`) and starts the instance. Its deadline is the acceptance time plus the blueprint's.
   - `contract-decline { offer }` removes the offer and starts its key's cooldown.
   - `contract-cancel { contract }` fails an active generated or authored contract with the reason `cancelled`, which books its penalty.
   - A deadline that passes books the penalty, a completion books the reward (ADR 0175 point 6).
   - Refusals name the reason, and, for full slots, the upgrade that lifts them.
5. **Slots are the `mission-control` capacity** of the primary site (ADR 0123: "active contracts"; stock Mission Center 3, 6 and 12). Plan 099 said Administration, but ADR 0123 already gave this key to the Mission Center and strategy slots (`admin`) to Administration. Active authored and generated contracts both count. A site without such a building has no limit, which keeps old worlds working.
6. **Transfer windows.** The template context's `window(target)` runs `hohmannToTarget` (`@orbital/kepler`, plan 045) on the home body's and the target's states around their common parent. It gives the next departure and the transfer time. For a sibling planet, a template sets its deadline to the wait, plus the transfer, plus a margin. Moons of the home body need no window.
7. **Expected value** = advance + reward funds − the estimated launch cost, labelled an estimate.
   - **The cost** is `estimatedLaunchCost(deltaV) = CONTRACT_COST_BASE + CONTRACT_COST_PER_DV2 · deltaV²` in core. The base, 5 000 funds, is the smallest rocket: a stock tank and engine cost about 8 300. The factor makes the career bot's two-stage rocket cost its real price, about 26 000, at the Δv to orbit.
   - **The Hangar's cheapest library design** that meets the objective (plan's design note) is a web refinement. The sim knows no library, and the screen's estimate label stays until that lands (follow-up).
8. **Stock templates** (tiers 1 to 3):
   - an altitude record;
   - orbit;
   - a moon flyby;
   - a moon landing;
   - a moon landing and return;
   - a flyby of a sibling planet, generated only in systems that have one, with the window deadline.

   Rewards scale with the estimated cost and the tier: advance plus reward is 1.2, 1.25 or 1.3 times the estimated cost, ±10 %. Riskier jobs pay a larger margin. The career bot's ten-year band set tier 1 (plan 099 journal). Advance 20 % of the reward, penalty 50 %, and a reputation reward of 5 × tier.
9. **Snapshot, save and screen.**
   - **Snapshot:** `Snapshot.contracts = { enabled, slots, used, offers, contracts }`. `contracts` lists the generated ones that were accepted, with their instance id and status. The live progress is in `Snapshot.objectives`.
   - **Save:** `SimSave.contracts = { next, rng, offers, accepted, cooldowns }` is optional in the current save format (6), like `objectives`. It is absent until the first offer.
   - **Screen:** the Administration screen's Contracts tab lists Offered, Active and Completed. Its detail shows the brief, the objectives with checkboxes, the advance, reward, penalty, deadline and the estimate, with Accept, Decline and Cancel. The Mission Center lists the active contracts.

## Alternatives considered

- **Registering generated contracts as definitions at run time:** rejected. Registries are frozen after load, and a save would need them back before the objectives resolve.
- **Bound contracts (one vessel):** rejected for procedural ones. Players expect any vessel to do the job, and binding at acceptance would need a vessel picker.
- **Slots from Administration:** rejected (point 5).
- **A per-tick offer flood with a cap only:** rejected. The plan wants few offers; one per tick, plus per-template limits, gives a steady trickle.

## Consequences

- **Mod API:** `defineContractTemplate`, `ctx.contractTemplates`, report kind `contract-template`, `estimatedLaunchCost`, `expectedValue`; additive, `API_VERSION` patch bump.
- **Protocol:** the commands `contract-accept`, `contract-decline` and `contract-cancel`; `Snapshot.contracts`; the ledger causes `contract.advance` and the contract ids.
- **Save:** an optional field, and an optional `since` on objective instances; no format bump.
- **Rule:** `stock.contracts`.
- **Follow-ups:**
  - the Hangar-based estimate;
  - reactive contracts from agencies (126);
  - bidding;
  - contract saturation for repeated kinds (ADR 0098 economy note; with markets, 097).
