# 0084 — Target markers and rendezvous aids: page-side, conventions of the genre, no new command

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/057-target-markers-and-rendezvous-aids.md
**Builds on:** ADR 0033 (`Renderer.project`), 0049 (SAS), 0056 (nodes are sim state), 0065 (targets). **Research:** research/rendezvous-aids.md

## Context

Plan 035 left the target as a card: numbers, a select and two SAS modes. A rendezvous needs the target where the player looks (navball, map, flight view) and aids to plan the burns.

## Decision

1. **Navball.** With a target the ball shows `target` and `anti-target` markers. The speed reference gets a third mode `target` (cycled by `V` only while a target exists; a preference `target` without one falls back to auto): the readout is the vessel's velocity relative to the target, its `vertical` is the range rate (positive opening). In that mode the prograde pair is replaced by `target-prograde` (the vessel's velocity relative to the target) and `target-retrograde` (the burn that cancels it), as in the genre's convention, with their own glyphs so the reference in force is visible; radial and normal markers stay on the orbit. `target` mode is not a SAS reference: a `sas` command from it uses `orbit`.
2. **Closest approach across spheres is computed in the page**, by `kepler.closestApproachPatched`: the vessel's patched-conic path (`predictPatchedConics`) is evaluated at any time by propagating inside its segment, the target moves by `bodyStateAt` (a body) or by its current conic about its own primary (a vessel). The sim's `approach` (ADR 0065) is unchanged. Rationale: the sim computes it only for vessels with a target and per snapshot (0.075 ms); the patched search costs a prediction and is wanted only in the map and for the planner buttons, and it needs no save or API change. The page's value is used wherever the sim's is `null`; when both exist they agree (a test pins that). A target vessel that changes sphere during the window is followed on its current conic only (documented limit).
3. **Map.** Markers are a DOM/SVG layer over the canvas placed with `Renderer.project`, like the Ap/Pe markers: the target (dot and name), the vessel and target at the closest approach (a pair with the distance), the target's orbit as a projected polyline (so the renderer, owned by other work, does not change). A click on a body, another vessel or a body's orbit line targets it; the vessel's own path still takes the click first (it places a node).
4. **Node helpers** are pure functions in `kepler` (`matchVelocityBurn`, `hohmannTransfer`, `hohmannToTarget`, `relativeNodes`); the Target card turns them into `node-set` commands (existing command, no API bump). Limits stated in the card and docs: Hohmann assumes near-circular coplanar orbits (departure radius and mean motion from the current radii), the plane-change burn is separate from the transfer, all are impulsive like every node.
5. **Flight view.** The target gets a distance label at its projected position, or an arrow at the screen edge when it is off screen. For a point behind the camera `project` returns null; the direction is then taken from the vessel's projection and the projection of the point mirrored through the vessel (valid because the camera orbits the vessel).

## Alternatives considered

- Closest approach in the sim for all spheres: a prediction per tick for every targeted vessel, a snapshot change, and a stale-save question; the page needs it only on demand.
- A renderer-side target orbit line (`MapPathSegment`): touches the scene graph owned by the effects work, and a polyline overlay costs about 100 projections per frame in map view only.
- Replacing prograde in target mode without new kinds (what KSP does): a player cannot tell the reference from the glyph.
- A rendezvous autopilot: out of scope (plan 057).

## Consequences

- `architecture/` kepler description lists the four helpers and the patched search; the glossary gets "target mode".
- No save format, core API or script API change.
