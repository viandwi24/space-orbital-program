# 0327 — What a branch is for

**Status:** accepted
**Date:** 2026-10-23
**Plan:** the player-journey audit, Q7 (`docs/research/player-journey-audit.md`, J12)
**Builds on:** ADR 0229 (branch space centers), ADR 0125 (building placement), ADR 0231 (the satellite contract)

## Context

A branch Space Center could be founded, but nothing asked for one.

- A branch could hold every home building: a Hangar, a Mission Center, an Astronaut Complex, R&D or Administration. The agency reads its capacity (crew, contracts, research) only from the home Space Center, so a copy at a branch was money spent for nothing.
- In the stock system, launching from a higher latitude is only a cost: the equator gives the most rotation and reaches every inclination. No contract asked for more.

## Decision

1. **HQ-only buildings.** A building's `placement` may be `'hq'`, meaning the home Space Center only: not at a branch and not off-world. `canPlace` refuses it with the reason `placement`; the web build menu says "Only at the home Space Center". Stock's Hangar, Mission Center, Astronaut Complex, R&D and Administration are `'hq'`. Pads, the runway, dishes, the propellant plant and the test stand stay `'home'`, so a branch has what a launch needs.
2. **A vessel remembers its launch latitude.** A vessel loaded at a site records `launchLatitude` (rad) from its pad. Pieces that split off keep it, and it is saved with the vessel. The objective view carries it as `ObjectiveVesselView.launchLatitude`; it is absent for a vessel not launched from a site.
3. **The polar customer.** `stock.satellite` takes `minLaunchLatitude` (rad). With it, only a vessel launched from that far from the equator, north or south, counts. The new stock template `stock.contract-polar-satellite` (tier 2, after the first home orbit) asks for an orbit at 90° or 98° and a launch from 30° latitude or more. The brief says a branch founded there will do. It pays what an equatorial launch would cost with its plane change.
4. **API 0.1.119**, additive: the `'hq'` placement, `ObjectiveVesselView.launchLatitude`, and the satellite objective's new param.

## Consequences

- A branch has a reason: the polar and Sun-synchronous orders. A home world built at a high latitude meets them without one.
- The rule is a customer's, not physics. A real reason (a range safety fan clear to the north) can replace it later without changing the objective.
- A world whose save already has an HQ-only building at a branch keeps it; only new placements are refused.
