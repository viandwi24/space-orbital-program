# 0300 — Pre-docked ports: a docking face node, built pairs start docked

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/356-shuttle-rebuild.md
**Builds on:** ADR 0218 (docking), ADR 0071 (tilts), plan 308 (turning a part onto a side node)

## Context

KSP players carry payloads that are docked from the start: they put two docking ports face to face in the editor, and in flight "Undock" (or "Decouple node") sets the payload free. A shuttle carries a station module in its bay this way.

We had two gaps:

- The Hangar never turns a part over. A port's face (+Y) cannot be attached onto another port's face (+Y).
- Even if it could, the sim marks a port `docked` only after a capture in flight. So a built pair would be a plain joint that Undock refuses.

## Decision

1. **A node may be a docking face.** It is an optional field on the attach node, `face: 'docking'`; the stock ports set it on their `top` node. It is data on the part, so the editor does not need to know about modules.
2. **The Hangar turns a part onto a docking face.** When both the parent's free node and the picked part's node are docking faces, the target carries the tilt that makes them face each other:
   - a half turn when they point the same way (a port onto a port);
   - a quarter turn when they are at right angles (a side port, such as a module's, onto a keel port).

   The design resolver already accepts such a tilt (plan 308). At a docking face only these face-to-face matches are offered, because stacking a port's base on another port's face is never wanted.

3. **A built pair starts docked.** When a vessel spawns, each attachment that joins two dock nodes (`dock` hook) on both sides marks both ports `docked`. Saves keep module state, so a loaded game keeps it.
4. **Undocking a built pair works like any undock.**
   - The port's Undock detaches its face node with `UNDOCK_IMPULSE`.
   - A split between two dock nodes releases both ports (`docked: false`) and blocks capture for `UNDOCK_COOLDOWN`, whether or not a capture record exists. Without a record, the payload side gets a new name (ADR 0252), as for a decoupler.
5. **Ports that just parted ignore each other until they are apart.** Each port remembers the one it left (`PartState.portLeft`). The two neither pull nor capture each other until their faces have been beyond `MAGNET_RANGE`; after that they dock again as usual.
   - Without this rule, the magnet caught a payload drifting at 6 cm/s as soon as the cooldown ended.
   - The rule applies to every undock, not only to built pairs.
6. **Undock on stage.** `stock.docking-port` gains `stageUndock` (default off), a Hangar build toggle: staging undocks a docked port.
7. **A hollow bay.** A module may declare its part `hollow(config)`: the part's own collision boxes are left out, and only the module's `colliders` remain. `stock.bay` with `walls` collides as a square tube whose top (the doors) is gone while the doors are open. A payload undocked inside the orbiter's bay was otherwise pushed out of the solid box at 10 m/s; now it leaves through the top at the undock speed.

## Consequences

- Payloads can be built docked in a cargo bay or on a carrier, and set free with the gentle undock push. In the plan 356 flight test, the Wayfarer's module drifts out of the open bay at 9 cm/s.
- A port that undocked cannot dock with the same port again until it has been 5 m away from it. Docking with any other port is not affected.
- Other mods can mark their own nodes as docking faces, and their own parts hollow.
