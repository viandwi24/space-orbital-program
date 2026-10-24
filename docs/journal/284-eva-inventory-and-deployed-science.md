# 284 — EVA inventory, containers and deployed science stations

**Plan:** [plans/284-eva-inventory-and-deployed-science.md](../plans/284-eva-inventory-and-deployed-science.md) · **Session:** Worker B, 2026-10-24 · **ADR:** 0356 (0264, 0120, 0125, 0235, 0178) · **API:** 0.1.129

## What was done

| Where | What |
|---|---|
| `core` | `PartDefinition.cargo`; `ExperimentDefinition.station`; the commands `cargo-move`, `cargo-attach`, `cargo-detach`, `cargo-place` (protocol and schemas); `Snapshot.stations`; API 0.1.129 |
| `sim/cargo.ts` | the four commands: inventory moves with volume checks, an engineer's attach (the Hangar's resolver places the part; the part entity is built with its saved module states; the body is rebuilt in flight) and detach, placing a deployable item as a kept vessel |
| `sim/stations.ts`, `tick.ts`, `snapshot.ts` | stations from the items in range of a control unit; power against draw; a link; one yield a day; the station list in the snapshot with the reason it is idle |
| `mods/stock` | `stock.inventory`, `stock.station-item`; the cargo locker and eight station items; four station experiments; the suit's 12 L inventory; `cargo` on the small radial parts; tech with Surface operations; the tech pacing test ignores station experiments |
| tests | `sim/test/cargo.test.ts` (an engineer takes a battery off a hull and fixes it elsewhere, charge kept; a part that is not cargo stays; a control unit, an RTG, an antenna and an experiment yield each day; without power none), the stock lists and snapshot |

## Choices

- A station's power is arithmetic over its items' rates (a panel at 0.4 of its rating for the night), not the items' own batteries: items are separate vessels on surface rails.
- The experiment's `station` flag keeps station science out of the tech pacing: it comes from other bodies' ground over days, not from the first ascent.
- An engineer is the profession the crew system has (`engineer`); no new rule.

## Open

The HUD and Hangar for the commands (the plan's step 2 UI); the scientist's and the seismometer's bonuses; screens of the eight items (they reuse the radial instrument, RTG, panel and dish generators); stations at physics warp; contracts for stations.
