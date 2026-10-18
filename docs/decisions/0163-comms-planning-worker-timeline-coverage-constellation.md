# 0163 — Comms planning: a planning Worker on snapshots, the sim's link rule on conics, a coverage grid, resonant deployment

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [118](../plans/118-comms-planning-tools.md)
**Builds on:** ADR 0101 (comms tiers; point 2: planning off the sim Worker), ADR 0179 (the link rule), ADR 0185 (range scale), ADR 0188 (routing), ADR 0173 (the trajectory provider), ADR 0118 and 0158 (the Mission Center and its Network layer)

## Context

Tier 3 of ADR 0101 asks for three planning tools: a contact timeline, a coverage map and a constellation planner. ADR 0101 point 2 keeps them out of the sim Worker: the sim's network update has a budget of 0.5 ms per step. The page has the snapshot (stations with system positions and ranges, vessels with orbits) and the catalog (bodies, parts), but not the antenna definitions, and module hooks run only in the sim.

## Decision

1. **A planning Worker.** `apps/web/src/lib/comms-planning/` holds pure functions (`timeline.ts`, `coverage.ts`) and `planning.worker.ts`, a module Worker that answers `{ id, kind, input }` with `{ id, result }` or `{ id, error }`. The Mission Center starts it on first use. Results are cached by request: the kind, the snapshot time and the inputs. Nothing in it imports `@orbital/sim`, and nothing in `sim.worker.ts`'s import graph imports it. A vitest walks both import graphs to enforce this.
2. **The geometry is the sim's link rule on conics.** The model takes its inputs from the snapshot:
   - **Vessel:** its orbit in its current sphere of influence, propagated by `@orbital/kepler` (no burns, no SOI change within the horizon).
   - **Bodies:** positions from `bodyStateAt` on the catalog's bodies.
   - **Station:** its body-fixed direction and radius, recovered from its snapshot position by undoing the body turn `qAboutY(ω t)`, as the sim places it.
   - **Link:** a pair links when the distance is at most `√(range_a × range_b) × scale` and no body sphere lies within 1 m of the segment. Terrain is ignored; a planning approximation, shown in the panel.
   - **Timeline steps:** samples every 10 s (the sim's `NETWORK_SAMPLE`), each change dated by bisection to 0.01 s (`LINK_TIME_TOLERANCE`).
3. **A vessel's range rating, page-side:** the strongest antenna among its parts whose part definition carries a module config `{ antenna: <id> }` naming a registered antenna, and whose module snapshot does not say `enabled: false`. The sim Worker's `ready` catalog gains `antennas` (id, label, range) for this. It reads the definitions; it is not a contract change.
4. **Coverage** is an equirectangular grid over a body, 72 × 36 cells by default. A cell's value is the fraction of samples over the horizon at which a receiver at that ground point links to at least one station or vessel. The receiver is a reference antenna the player picks, by default the weakest registered one. The panel paints the grid into a canvas; the renderer is not touched.
5. **Constellation planner** (`packages/kepler`, `resonantDeployment`): for N satellites on a circular target orbit of radius r, the carrier flies a deploy orbit with one apsis at r and period `T × (N+1)/N` (above) or `T × (N−1)/N` (below, N ≥ 2). It drops one satellite at that apsis each revolution, and each satellite circularises there. Each drop then trails the previous one by `360°/N`. The plan gives:
   - the deploy orbit (periapsis, apoapsis, period);
   - the insertion Δv from the circular target orbit;
   - the circularisation Δv per satellite;
   - the drop times.

   It refuses a deploy orbit whose periapsis is below the body radius plus a stated clearance.
6. **Mission Center panel:** a "Comms planning" panel with three tabs (Timeline, Coverage, Constellation), opened from the layers row; it reads the page's snapshot and catalog and calls the Worker.

## Alternatives considered

- **Running the planners in the sim Worker on request:** exact (terrain, routing), but against ADR 0101 point 2, and a long timeline would stall the sim.
- **A range rating in the snapshot:** clean, but a protocol change outside this plan's Touches. Filed as a contract request: `network.vessels[].range` would replace the page-side heuristic of point 3.
- **Coverage as a renderer texture on the planet:** prettier, but a renderer change outside the Touches; the canvas grid gives the same information.

## Consequences

- The timeline matches the sim for vessels on rails over spherical bodies. Terrain near a station and SOI changes inside the horizon make it differ; the panel says so.
- Routing through relays is not planned: the timeline is per pair (vessel, station or vessel).
