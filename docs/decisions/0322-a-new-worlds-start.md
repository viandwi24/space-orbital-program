# 0322 — A new world's start: the core buildings and a Career crew

**Status:** accepted
**Date:** 2026-10-23
**Plan:** the player-journey audit, Q1 (`docs/research/player-journey-audit.md`)
**Builds on:** ADR 0115 (buildings on the grid), ADR 0123 (levels, capacities, upkeep), ADR 0176 (crew, salaries)
**Changes:** ADR 0176 point 8 (who is paid a salary)

## Context

A new world started with the Legacy layout only: the pad, the Hangar, the Mission Center and Administration, and no crew. This caused three problems:
- A Career player could not fly a crewed pod. There was nobody to seat, and hiring opened only from an Astronaut Complex that was not built and that nothing pointed to.
- In Science and Career, the tech tree had no door: the R&D page opens from its building.
- In Career (engineering), the Test Stand was missing.
- The Space Center lesson waited on R&D and Astronauts pages its world could not open.

Seeding a crew of three under the old salary rule (every member paid every tick) would have cost more than a government grant.

## Decision

1. **The start.** A world started fresh (never one resumed from a save) gets, active at level 1 and free:
   - the Astronaut Complex and R&D, in every world;
   - the Test Stand where reliability is on.

   They take the first free cells round the site centre, with their roads. The implicit Legacy site is written into the world as a first building would write it.
2. **A Career crew.** With the economy on and an empty roster, the start adds a pilot, an engineer and a scientist, free. Worlds without the economy still hire a pilot at launch.
3. **Salaries on missions.** A member is paid their daily salary only while `assigned`, seated in a vessel. A crew at home costs nothing; the recruit fee (20 days of the base) is the cost of a hire. This changes ADR 0176 point 8.
4. **The month's balance.** The Space Center operations charge is 3 200, not 4 000. It absorbs the new buildings' upkeep (Astronaut Complex 300, R&D 500), so a Career month costs what it did. The career-bot guardrails keep their exact numbers.
5. **Saves.** A save writes the crew in the schema's key order, so a resumed run writes the same bytes as an unbroken one. A member's fields used to be added as they happened.

## Consequences

- A new Career world flies a crewed pod on day 1, and money goes to upgrades rather than to the doors.
- Older worlds keep what they have (they resume from saves). Their players can still build the two buildings.
- Hosts must resume from a save alone, never with a `world` beside it: buildings placed in play live in the save's world. The web already does this; two tests did not, and now do.
