# 0123 — Construction on the world tick, typed capacity keys, upkeep every 30 days

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [096](../plans/096-building-catalogue-levels-upkeep-capacity.md)
**Builds on:** ADR 0097 points 4 and 5 (buildings are data, construction costs time and money), ADR 0098 point 3 (capacity-only gates), ADR 0113 (ledger, charges), ADR 0115 (placement), ADR 0150 (Launch screen), ADR 0171 (world tick)

## Context

Plan 090 gave buildings levels with `cost`, `buildDays`, `upkeep`, `power` and `capacity`, all zero or placeholders, and a `PlacedBuilding.state` of `active` or `planned`. Placement is free and instant. Comms (117) and the Launch screen (094) already read one capacity each (`comms-node`, `launch-pad`) straight from the level. Plan 096 needs: what construction is in the sim, when it ends, what a level's capacity means for each consumer, how upkeep is charged, and when the limits apply.

## Decision

1. **Construction is building state on the site, finished by the world tick.** `PlacedBuilding.state` gains `building` and `upgrading`, with `readyDay` (the tick day on which it is done). `place-building` debits level 1's cost (times the cost-multiplier rule) and starts `building` with `readyDay = today + buildDays`, refusing with the shortfall when funds do not cover it. A new command `upgrade-building { site, id }` debits the next level's cost and starts `upgrading`. On the tick of `readyDay` the building turns `active` (an upgrade raises `level` by one) and the sim emits `building:ready`. A level with `buildDays: 0` is done at once. With the economy off (Sandbox, the Legacy world) placement and upgrades are free and immediate. The state lives in the world info's sites (ADR 0143), so a save carries it and no save format change is needed (additive optional fields).
2. **What works while building.** A `building` building provides nothing. An `upgrading` building keeps working at its current level until the upgrade is done.
3. **Capacity keys are typed in core.** `CAPACITY` names each key with its unit and meaning: `hangar` (parts in a design), `launch-pad` (launch mass, t), `runway` (length, m; read by aircraft plans, not a limit yet), `crew` (roster size), `mission-control` (active contracts), `comms-node` (station tier), `lab`, `admin` (strategy slots), `storage` (kg), `production` (recipes at once). A site's capacity for a key is the highest value over its working buildings (`siteCapacity`); a site with no building providing the key has **no limit** for it (the Legacy layout has no Astronaut Complex, and a mod's building is optional). `capacityUpgrade` names the cheapest registered level that lifts a need ("Hangar level 2: 120 parts"). Core's `FLIGHT_TOOLS` (the never-gated tools of ADR 0176, now with `delta-v`) is the one list, and a test asserts that no capacity key, and no stock building's capacity, is one of them.
4. **Limits apply where the economy is on.** The Hangar's parts check, the Launch screen's mass limit and the crew roster limit apply in a world whose `stock.economy` rule is on (Career). In Sandbox and the Legacy world every design fits every pad (this changes the Launch screen of ADR 0150, which filtered by mass in every world). The consumers in this plan: Hangar parts (a no-go check that names the upgrade), Launch mass (designs over the limit are listed with the upgrade), crew roster (`crew-hire` refused at the limit). `mission-control`, `admin` and `production` are read by plans 099, 101 and 097.
5. **Upkeep every 30 days.** On each tick whose day is a positive multiple of 30, every `active` or `upgrading` building writes its level's `upkeep` (times the cost multiplier) as a ledger entry with the cause `economy.upkeep` and the building id as `ref`. The projection includes it (`upkeepCharges` turns the site list into charges). Debt is allowed: upkeep is charged even when funds go negative, and "Needs attention" says so.
6. **Needs attention** in the Space Center lists buildings under construction with their ready day, finished construction since the last visit (`building:ready` events, as kept by the page), and "Upkeep due on day N is more than the funds" when the next upkeep is larger than the balance.
7. **Stock values** (three levels each, recorded in the plan's journal): Hangar 30, 120 and 255 parts; launchpads S, M and L 18/30/45 t, 60/100/150 t and 180/300/500 t; costs from 20 000 to 400 000 funds (the buildings a world starts with are already built), build times from 2 to 30 days, upkeep about 1 % of the cost per 30 days.

## Consequences

- `defineBuilding` levels now mean something; a mod's building costs funds in Career.
- The Launch screen lists every design in Sandbox.
- In the web client the Space Center runs the world's newest save and writes it back after a change, so a launch into the world (ADR 0152) carries the spending and the construction. A world with no save yet starts from its record.
- Roads drawn by hand, earthworks and moving a building stay out (ADR 0115).
