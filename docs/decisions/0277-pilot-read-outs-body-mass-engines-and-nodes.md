# 0277 — The vessel pilot reads the body, the mass and the engines, and sets maneuver nodes

**Status:** accepted (owner's request, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/321-guidance-computer-autopilots-mod.md
**Amends:** ADR 0271 point 3 (`VesselControl`, shipped as `VesselPilot`)

## Context

Plan 321 ships MechJeb-style autopilots (execute a node, circularize, ascent, landing) as a mod. Every one of them needs numbers the pilot of ADR 0271 does not give: the body's gravitational parameter, radius, atmosphere height and spin (orbit, gravity, surface speed), the vessel's mass and the thrust and specific impulse of its burning engines (burn time, suicide burn), and a way to place a maneuver node (circularize). A mod could rebuild some of it from part definitions, as the script telemetry does, but that duplicates the sim's own mass and engine model and can disagree with it. The sim knows these numbers exactly when it builds the pilot for an autopilot step.

## Decision

1. **`PilotFacts`, given by the host.** `createVesselPilot(view, id, send, facts?)` takes an optional `facts = { body, mass, engines }`:
   - `body`: `{ id, mu, radius, atmosphereHeight, angularVelocity }` of the vessel's sphere of influence (m³/s², m, m with 0 for none, rad/s inertial).
   - `mass`: the vessel's current mass, kg (parts plus contents, the sim's `totalMass`).
   - `engines`: per engine module `{ part, thrustVacuum, ispVacuum, ignited, flameout }` from the module descriptor (ADR 0033): vacuum thrust is the first point of the thrust curve, `ispVacuum = thrustVacuum / (massFlow · g0)`.
   The sim's autopilot runner always passes them. A page or panel that builds a pilot from a snapshot alone leaves them out, and the read-outs below are then `undefined` / empty.
2. **Read-outs on `VesselPilot`:** `body`, `mass`, `engines`, and `maxThrust` (sum of `thrustVacuum` over engines ignited and not flamed out, N).
3. **Nodes from the pilot:** `addNode(time, prograde, normal, radial)` sends `node-set` (new node) and `removeNode(id?)` sends `node-remove`, so an autopilot plans its own burn and the player sees it on the map like any node.
4. Like every other pilot call these are commands through the one handler (ADR 0271 point 1), sent with source `autopilot` (ADR 0276).

## Consequences

- `@orbital/sdk` re-exports the new types; mods compiled against the old pilot keep working (all additions).
- Vacuum figures only: an ascent through an atmosphere gets less thrust than `maxThrust`; the guidance autopilots treat it as an upper bound and fly closed loop.
- The script API is unchanged; scripts already compute mass and engines in their telemetry.
