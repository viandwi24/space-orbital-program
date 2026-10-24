# 0356 — Cargo, inventories and deployed science stations

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/284-eva-inventory-and-deployed-science.md
**Builds on:** ADR 0264 (the design), ADR 0120 (EVA), ADR 0125 (bases), ADR 0235 (surface links), ADR 0178 (science)

## Decision

ADR 0264 decided the shape; this records how it was built (stage 1: the sim, the parts and their tests; the Flight HUD for it is open).

1. **`PartDefinition.cargo = { volume, deployable? }`** marks a part an astronaut can carry (litres). **`stock.inventory`** (`ModuleInventory`, `capacity` L; state: the items) holds them: the EVA suit carries 12 L, `stock.cargo-locker` 60 L. An item is `{ part, state? }`: the part's definition and the module states it had when it was detached, so a battery keeps its charge and a panel its fold.
2. **Four commands** (all take a `suit`, a vessel with a crew member, within `EVA_TAKE_RANGE` 3 m of the part):
   - `cargo-move { part, index, direction: take | store }` between the suit's inventory and a container's (volume checked);
   - `cargo-attach { host, index, angle, y }` (an engineer only) fixes item `index` to the side of `host`: the same resolver as the Hangar (`resolveVesselDesign`, a surface link) places it in the vessel's design, the part entity is made and its saved states put back, the vessel's body is rebuilt if it is in flight;
   - `cargo-detach { part }` (an engineer only) takes a cargo part off a hull into the suit; refused for the root, for a part with something attached to it, and for a docked vessel (the dock records index the design: undock first);
   - `cargo-place { index }` sets a `deployable` item on the ground beside the suit: a one-part vessel, kept (`stock.station-item` is a `keep` module).
3. **A station** is the items within 40 m of a control item. `stock.station-item` gives an item its role: `control`, `power`, `antenna` or `science` (with an `experiment`). Power is the sum of the power items' modules' rates (a panel at 0.4 of its rating, a day's average) against the sum of the experiments' `power` draws; the link is any antenna item, enabled, whose vessel has a connection (`signalOf`). A station that has an experiment, enough power and a link yields once a day each science item's experiment (`makeResult`, credited as transmitted: a subject's repeat factor and cap apply). `ExperimentDefinition.station` marks such experiments: they are not run by hand and do not count in the tech pacing. The snapshot's `stations` lists each station with its power, link, experiments and the reason it yields nothing.
4. **Eight items**: control unit, RTG, solar panel, antenna, goo monitor, weather station, ionograph, passive seismometer (`stock.station-*`, 4 to 10 L), tech with Surface operations. Existing small radial parts carry `cargo` (batteries, the radial instruments, the whip and flat panel, the data drive).
5. **Mod API 0.1.129**: additive (`cargo`, `ExperimentDefinition.station`, the commands, `Snapshot.stations`).

## Left open

The Flight HUD and Hangar for it (take, store, attach, detach, place); the scientist's bonus on a station's yield and the passive seismometer's bonus for nearby impacts; item state in saves beyond what a module's snapshot holds; stations on rails at warp with their own power model; contracts for stations (a new draft).
