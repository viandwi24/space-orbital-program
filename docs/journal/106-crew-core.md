# 106 — Crew core: roster, professions, traits, XP, seats

**Plan:** plans/106-crew-core.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-17), three-agent team mode · **ADRs:** [0176](../decisions/0176-crew-roster-places-xp-seats-death-salaries.md) (new), [0100](../decisions/0100-crew-a-full-simulation-every-aspect-a-world-rule.md), [0109](../decisions/0109-control-needs-a-command-source-like-ksp-career-crew-preset-and-10px-text.md) · **Research:** none

**Status when written: criteria met here, handed over as `ready/106`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/crew.ts` (new) | professions, `ABILITY_KEYS` and `FLIGHT_TOOLS`, `CrewTraitDefinition`, `CrewNamesDefinition`, `CrewMember`, `SaveCrew`; `abilitiesOf`, `placeXp`, `levelOf`, `salaryOf`, `generateCrewName`, `drawTraits` |
| `packages/core` | part `crewCapacity`; registries `crewTraits` and `crewNames`; `ctx` registrars; commands `crew-hire`, `crew-transfer`, `load-vessel` `crew`; events; `Snapshot.crew`, `VesselSnapshot.crew`; optional `SimSave.crew`; `API_VERSION` 0.1.36 |
| `packages/sim/src/crew.ts` (new) | hire, seats, transfer, places after each step, XP at recovery, death rule in `destroyVessel`, returns and salaries on the world tick, snapshots |
| `mods/stock` | six traits, a syllable set, a seat in the command pod |
| tests | `packages/core/test/crew.test.ts` (4), `packages/sim/test/crew.test.ts` (6) |
| docs | ADR 0176, `plugin-system.md`, `simulation.md`, guide "Crew" |

## Decisions and deviations

- **XP test.** Stock has no parachute, so a soft landing at home cannot be flown in a test. The flyby is recorded on a transfer orbit on rails, and the booking is tested with a recovery on the moon. Recovery is allowed anywhere (plan 095), and its credit is 0 away from home.
- **Control is unchanged** (ADR 0176 point 9): crew needed for control is plan 114's, with probe links.
- **The roster starts empty**, so every existing save, fixture and snapshot is unchanged. Plan 108 hires the starting crew.
- **The Legacy world is a Sandbox**, where experience and salaries are off (078 presets). The tests switch them on with `set-rule`.

## Follow-ups

- 107: life support, morale, rest, g-load (uses `gTolerance` and `panicResistance`). 108: the Astronaut Complex and the starting crew. 109: EVA. 111: crew in the vessel panel. 114: the command-source rule. 103 and 130: `dataQuality` and `repairRate`.
- A stock parachute (a new draft is worth it once a plan needs crewed returns home in a test).

## Verification output

See the `ready/106` tag message.
