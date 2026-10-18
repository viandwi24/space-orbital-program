# 0190 — AI agencies: state machines on the world tick, owned objects, relay rental, reactive contracts and news

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 126
**Builds on:** ADR 0096 point 4 (a living world: 3 to 6 agencies, real on-rails objects, relays rented once comms exist, news), 0098 (world firsts, markets and reactive contracts), 0171 (world tick and streams), 0186 (contract offers), 0188 (routing).

## Context

The rule `stock.agency-count` exists, but no agency does anything. Plan 126 makes rivals launch real objects that the player sees, targets and can rent, and that produce news and contracts. Open questions:

- what an agency is;
- when it launches;
- what its object is in the sim;
- how the player's commands treat it;
- how rental joins routing;
- how objects end, so a ten-year world does not fill up;
- what is saved.

## Decision

1. **Agencies are data.** `defineAgency({ id, name, personality, budget, programme })`:
   - `personality` is `{ aggressiveness, risk }`, each 0 to 1;
   - `budget` is `{ start, monthly }` in funds;
   - `programme` is an ordered list of missions `{ id, kind: 'satellite' | 'relay', altitude, inclination?, cost, success, prepDays, lifeDays, rent? }`, which repeats when it ends.

   The world runs the first `stock.agency-count` registered agencies, by registration order. Sandbox's preset is 0. A mod's agency therefore runs only if it registers before stock's six (a plugin booted earlier), or if the count is above the agencies before it. A world rule that names its agencies is a follow-up.
2. **The agency tick** runs once per world day, after the economy, in agency order, each agency with its own stream (`streamSeed(seed, 'agency:<id>')`):
   - its funds gain `monthly / 30`;
   - when its next mission's `readyDay` has come and it can pay `cost`, it launches;
   - the success roll is `random() < success × (1 − 0.3 × risk)`;
   - the next mission is ready after `prepDays × (1.5 − aggressiveness)` days;
   - a failure is news and costs the money; a success places the object.

   The same seed gives the same launches on the same days.
3. **Owned objects.** A success creates a vessel from a fixed design (probe core and dish, the same for every agency). It is placed on a circular orbit of the home body at the mission's altitude and inclination, at a phase from the stream, and on rails at once.
   - `VesselState.owner` holds the agency id, and the snapshot shows it.
   - The map, Mission Center and targeting see it like any vessel.
   - It is not the player's: control commands, actions, recovery, staging and nodes for an owned vessel are refused (`owned by <agency name>`). Targeting it is allowed. It never counts for the player's contracts, missions or milestones.
   - Placing an object skips the player's launch price and tech locks.
   - **Limits:** each agency keeps at most 2 objects. The oldest is deorbited when a third would be placed. An object is removed at the end of `lifeDays`. With 4 objects each, the ten-year career bot took 37.9 s against 29.9 s with 2.
   - **Passive:** an agency's object skips the per-chunk work of the rails steps (update hooks, heat, rebasing, SOI checks, debris, milestones). Its fixed circular orbit is read from its rails when needed. Unrented, it is not on the comms network at all.
4. **Rental.** Owned vessels take no part in routing (ADR 0188) unless the player rents them.
   - `relay-rent { vessel }` rents an owned relay for its mission's `rent` (funds per day): routing then uses it like the player's own. The rent is booked each world day (cause `agency.rent`, ref the agency id) and paid into the agency's funds.
   - `relay-end-rent { vessel }` ends it.
   - Without the economy, a relay cannot be rented.
5. **Reactive contracts.** When a rented relay, or any agency relay, reaches the end of its life early because of a failure roll (`0.2 × risk / lifeDays` per day), the agency offers a contract: put any vessel on an orbit at that altitude within 30 days. The offer goes into the contract offers of ADR 0186 (template id `agency.<id>`, key `agency:<id>:<altitude>`), with its reward from the agency's funds.
6. **News.** The last 50 events are kept: launches, losses, end of life, and new contracts. `Snapshot.agencies = { agencies: [{ id, name, funds, reputation, objects, nextDay }], news: [{ time, agency, text }] }`. The Mission Center shows the news feed and an agency strip.
7. **Save.** `SimSave.agencies = { agencies: [{ id, funds, reputation, next, readyDay, rng, objects: [{ vessel, mission, until }] }], rentals: [{ vessel, agency, rent }], news }` is optional, so there is no format bump. The vessels themselves and their `owner` are world data.

## Alternatives considered

- **Agency objects as markers, not vessels:** rejected. ADR 0096 point 4 asks for real objects that the map, Mission Center and target code see like any vessel. Renting one must route through it.
- **Relay capacity as a market commodity** (plan's scope line): deferred. A fixed daily rent per relay is enough to route and book. A capacity commodity needs markets for services (097 trades goods).
- **Unlimited objects:** rejected. Ten years of launches would fill the sky with rails vessels and slow every warp, so a cap and a lifetime keep it bounded.

## Consequences

- **Mod API:** `defineAgency`, `ctx.agencies`, report kind `agency`; additive, with an `API_VERSION` patch bump.
- **Protocol:**
  - the commands `relay-rent` and `relay-end-rent`;
  - the owned-vessel refusals;
  - `Snapshot.agencies`;
  - `VesselSnapshot.owner`.
- **Save:** an optional field.
- **Follow-ups:**
  - world firsts claimed by agencies (milestones);
  - market reactions;
  - customer-request contracts;
  - capacity as a commodity;
  - diplomacy and bidding.
