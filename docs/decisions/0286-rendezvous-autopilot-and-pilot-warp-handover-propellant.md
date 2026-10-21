# 0286 — A rendezvous autopilot in the Guidance Computer; the pilot warps, hands over to another autopilot and reads its propellant

**Status:** accepted (owner's request, 2026-10-22)
**Date:** 2026-10-22
**Plan:** plans/331-rendezvous-autopilot.md
**Amends:** ADR 0277 (pilot read-outs), ADR 0271 (autopilots)

## Context

Auto Dock (plan 310, 330) starts within 250 m of the target port. The owner asked how to dock from farther away and pointed at MechJeb's rendezvous autopilot, which flies a vessel from anywhere in orbit to a standoff near the target. The Guidance Computer (plan 321) already executes maneuver nodes through the public pilot, and `@orbital/kepler` already has the rendezvous aids of plan 057 (closest approach, match velocity, Hohmann with its phase wait, relative nodes). Three things are missing from the pilot:

- **Warp.** A rendezvous coasts for hours of game time. The node executor of plan 321 waits in real time (journal 321, open question).
- **Hand-over.** "Dock when close" means the rendezvous autopilot starts Auto Dock. An autopilot can send only commands for its own vessel, and the pilot has no call for `autopilot-engage`.
- **Delta-v.** An autopilot that should stop before the tank is dry needs the propellant mass; the pilot has the vessel's mass but not how much of it can be burnt.

## Decision

1. **`guidance.rendezvous`**, a new autopilot of the Guidance Computer, flies to the target vessel (or the vessel of a targeted port) in five phases, each burn a maneuver node flown by the node executor:
   1. **plane:** above 0.05° of relative inclination, a plane change at the nearer relative node;
   2. **transfer:** co-orbital (mean radii within 0.5 %): one phasing orbit of k revolutions (the smallest k whose burn is cheap, periapsis above the air); otherwise a Hohmann transfer at its phase window when the window opens within 12 orbits, else a Hohmann to the target's radius and a circularization, then phasing; a mid-course correction (Newton on the miss at a fixed arrival time) when the predicted closest approach is farther than 2 km;
   3. **match:** a node that matches the target's velocity 200 m before the closest approach along the relative path, so the vessel stops beside the target, not in it;
   4. **close:** a closed loop on the relative velocity toward the target: the wanted speed falls with the distance to a stop at the standoff (150 m); the main engine with hysteresis far out, RCS translation within 1 km when the vessel has RCS propellant;
   5. **hold:** keeps the vessel within 100–200 m at rest relative to the target (under 0.2 m/s) until the player stops it; with **Dock when close** and a targeted port, it controls from a free docking port of the same size and engages `autodock.dock`.
   Coasts longer than two minutes are skipped with `warpTo`. It aborts when the estimated delta-v exceeds what is left (with a 10 % margin), when it runs out of fuel and RCS propellant, when it cannot stop before the target's keep-out sphere (a collision course), and after four failed plans.
2. **`VesselPilot.warpTo(time)`** sends `warp-to` for the own vessel at the world's highest level: the sim grants what its warp limits allow (ADR 0202) and drops to physics warp when an engine lights, as for the player.
3. **`VesselPilot.engage(autopilot, params?)`** sends `autopilot-engage` for the own vessel: the new autopilot replaces the one that called it (outcome `disengaged`, reason "replaced by …").
4. **`PilotFacts.propellantMass` / `VesselPilot.propellantMass`:** the mass of the propellant mix the burning engines draw (the first burning engine's mix, limited by its scarcest resource, over the whole vessel), kg; undefined without facts. With `mass` and the engines' exhaust velocity it gives the delta-v left.
5. The rendezvous gets its own panel in the Guidance Computer mod ("Rendezvous"): engage, abort, phase, distance, relative speed, delta-v used and estimated, and the "Dock when close" setting (ADR 0285 settings).

## Consequences

- API 0.1.103: three additions; mods built against the old pilot keep working.
- `@orbital/sdk` re-exports the kepler rendezvous aids a mod needs (`propagateUniversal`, `closestApproach`, `relativeNodes`, `hohmannToTarget`, `orbitalAxes`, `burnComponents`), so a mod does not copy the orbital mechanics.
- An autopilot can warp the world. It warps only from a coast it plans, once per coast; the player who stops the warp is not overridden.
- Two-body only: the target must orbit the same body; a target in another sphere of influence is refused. The phasing and Hohmann plans assume near-circular orbits; the mid-course correction and the closed-loop close phase take up the rest.
- A held rendezvous keeps its vessel in flight (ADR 0271), like Auto Dock.
