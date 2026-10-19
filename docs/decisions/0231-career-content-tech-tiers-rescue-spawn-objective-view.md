# 0231 — Career content: a tiered tech tree with every part placed, contracts that see milestones and spawn a rescue, a richer objective view, per-item panel actions

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/231-career-content-for-new-parts.md
**Builds on:**
- ADR 0154 (tech tree: tiers, milestones, locked parts)
- ADR 0175 (objectives: pure primitives over a view)
- ADR 0186 (procedural contracts: templates, offers, slots, `since`)
- ADR 0194 (science dock panel)
- ADR 0218 (docking: dock records)

## Context

Plan 231 gives the new parts of plans 207–225 a place in Career. The plan called this content within the existing models. Four of its items need small contract changes:
- rescue, satellite, station and docking contracts need more than the objective view shows today: crew, inclination, antennas, power, ports, docks;
- a rescue needs a vessel that exists before the player flies;
- the new templates should wait for the milestones that make them possible;
- the science panel needs a button per experiment and per stored result. Its list nodes have none.

## Decision

1. **The tech tree:**
   - It has 22 nodes in tiers 0 to 5, each part in exactly one node. The suit, the flag and the thrown-off fairing panel are never built.
   - The tier 1 to 4 totals stay as they were (25, 60, 490, 300 science), so the pacing tests of ADR 0154 still hold.
   - The starting node holds the pod, the parachute, the small solid booster, the fin and the decoupler, with the reference rockets' parts. A KSP-style first flight needs nothing researched.
   - `mods/stock/test/tech-coverage.test.ts` fails when a stock part has no node or two.
2. **Templates see the world's firsts.** `ContractTemplateContext.milestones` lists the milestone ids already recorded (`orbit:stock.home`, `dock:stock.home`, …). The new templates offer nothing before theirs.
3. **A blueprint may spawn a rescue.** `ContractBlueprint.spawn` is `{ design, body, altitude, member }`. On accept the sim does three things:
   - It spawns the design on rails in a circular orbit at that altitude (the stock design is named "Stranded pod").
   - It adds a new crew member (stranded: free, past the roster cap) seated in its first seat.
   - It keeps `{ vessel, member }` on the accepted offer (`ContractOffer.spawned`).

   The rescue vessel is a normal vessel: Tracking lists it, it can be targeted and boarded.
4. **The objective view grows, additively:**
   - Each vessel adds:
     - `inclination` (rad, null without an orbit);
     - `seats` and `crew` (members aboard);
     - `antenna` (a working antenna part);
     - `power` (a module that produces EC);
     - `ports` (docking ports);
     - `docked` (the vessel has absorbed another by docking).
   - A vessel launched before the instance still counts when a vessel launched after it docked to it, so a station from before the contract can be docked to.
   - `ObjectiveView.rescues` lists the instance's own spawned members: `{ member, vessel, status }`.
5. **Four stock primitives:**
   - `stock.rescue`: every spawned member of the instance is home. The status is `available` again after a recovery.
   - `stock.satellite { body?, minPeriapsis, maxApoapsis, inclination, tolerance }`: a vessel in that orbit with an antenna and power.
   - `stock.station { body?, minPeriapsis, seats }`: a vessel in orbit with a docking port, that many seats and power.
   - `stock.dock { body? }`: a docked vessel in orbit of the body.
6. **Four stock templates:**
   - **Rescue** (tier 1): after `orbit:stock.home`. A pod at 80 to 120 km around Home.
   - **Satellite** (tier 1): after `orbit:stock.home`. Ap, Pe and inclination drawn, with ±10 % and ±2°.
   - **Station** (tier 2): after `dock:stock.home`. 2 to 4 seats.
   - **Docking** (tier 2): after `orbit:stock.home`. Two vessels docked in orbit of Home.
7. **Panel list items may carry actions:** `{ label, command }`, evaluated like a button. The host addresses one by `<list path>:<item>:<action>`.
   - The science panel lists each experiment with Run.
   - It lists each stored result with Transmit and Discard (`delete-data`).
   - The old "next" and "best" buttons stay as shortcuts.

## Consequences

- Mods can place their parts in the stock tiers through `techNode` or `unlocks`, as before. The coverage test applies to stock parts only.
- An offer's `spawned` field and `ContractBlueprint.spawn` are additive. A save without them reads as before. A rescue offer accepted in an old build has no spawn and stays unfinished, which is acceptable for a new template.
- The objective view is wider, but still pure data built per instance.
