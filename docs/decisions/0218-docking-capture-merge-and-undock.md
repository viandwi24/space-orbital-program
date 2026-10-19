# 0218 — Docking: capture numbers, merge into one vessel, undock restore

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/222-docking.md
**Builds on:** ADR 0208 point 3 (docking), ADR 0018 (one rigid body per vessel), ADR 0203 (node sizes), ADR 0215 (design records), ADR 0064 (targets)

## Context

ADR 0208 point 3 says ports of equal size pull together, capture when aligned and slow, merge, and undock back to the two vessels. It leaves the numbers, which vessel keeps its id, what an undock restores, how a station parked on rails is docked with, and how the sim stays free of stock ids.

## Decision

1. **Generic hooks, no stock ids in the sim.** `ModuleDefinition.dock(config)` returns `{ size, node }` (the face node). `ModuleDefinition.crossfeed(config, state)` lets a module close the part to stack flow. Stock `stock.docking-port` carries them, with Undock and Crossfeed in its descriptor (group `stock.docking`).
2. **Numbers** (KSP-like starting points):
   - magnet range 5 m between faces, capture at 0.15 m;
   - faces and the line between them within 15°; inside the capture range only the faces' angle counts, so a sideways miss under 0.15 m still captures;
   - the magnet lets go above 1 m/s, pulls at 0.15 m/s² (reduced mass) while the faces close slower than 0.3 m/s;
   - capture needs under 0.5 m/s; faster faces bounce and do not capture for 10 s;
   - an undocked port does not capture for 5 s, and the undock pushes with 150 N·s.
3. **Merge.** The keeper is the controlled vessel, then the heavier, then the lower id. The absorbed parts move into the keeper's frame and indices, joined by an attachment between the faces. One body is built from the joint momentum (ADR 0018). The keeper records a `DockRecord` (`VesselState.docks`): the other vessel's id, name, design, part list, stages and control part, and the keeper's own design and stages before the dock. Events: `vessel:docked`, milestone `dock`.
4. **Undock** detaches the face node (the stock action). The split calls `restoreUndocked`: when the cut is a recorded port pair, the far side gets its name, design, indices and stages back, and the keeper its own. Event `vessel:undocked`, milestone `undock`.
5. **Stations on rails.** An on-rails vessel with a port inside 50 m (centre to centre) of a flight vessel with a port is put in flight. Port vessels within 50 m of each other stay in flight (they count as active).
6. **Targeting a port.** `TargetRef` vessel gains `part`. The sim refuses a part that is not a port of that vessel. While both share a flight frame and the vessel has a free port of the same size, `TargetSnapshot.port` gives the angle, lateral offset, face distance and closing speed. The own port is the control part when it is a port, else the nearest one.
7. **Port frames** in `VesselSnapshot.ports`: each port's face point, direction and orientation in the snapshot's axes, for plan 226's Locked camera and the web's target list.
8. **Save.** `docks` and `portBlockedUntil` live on world components and round-trip as they are. The fields are optional and additive, so `SIM_SAVE_VERSION` stays 9 with no migration.

## Alternatives considered

- **A joint between two vessels** — rejected by ADR 0208 (one body per vessel).
- **Rebuild undocked designs from the merged one** — rejected: names and stages of the absorbed vessel would be lost; the record keeps them.
- **Bump the save version** — not needed: older saves have no docks, and a save with docks read by older code only loses the undock restore.

## Consequences

- API_VERSION 0.1.78 (additive): `dock` and `crossfeed` hooks, `TargetRef.part`, `TargetSnapshot.port`, `VesselSnapshot.ports`, the two events, the two milestone kinds.
- "Set as target" lives in the Target panel's list (each free port of a vessel is an entry), not in the port's own descriptor: a descriptor acts on the flying vessel's parts.
