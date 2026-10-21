# 0266 — Map paths are drawn in the frames of the bodies now; spheres of influence on demand

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/293-flight-map-crash-selection-soi-and-steady-lines.md
**Builds on:** ADR 0051 (body tree, SOI transitions), ADR 0056 (maneuver nodes), ADR 0242 (map filters)

## Context

The owner reported four problems in the flight map: a crash while editing a large escape burn, page text selected by drags, confusing wireframe "gravity" nets, and orbit lines that twitch while a node is edited or time is warped.

The twitch has two causes in how predicted paths are placed:

- A stretch of the predicted path was drawn at `bodyOffset`, the centre of its body **at the time the stretch starts**, in the system frame. Since plan 122 the home planet orbits the sun at about 9.3 km/s. So a planned stretch after a node 20 minutes ahead hung 11 Mm away from the planet, along the planet's orbit. The vessel's stretch hung where the planet was at the last prediction. At 1000× warp the planet moves 7 000 km between two predictions (750 ms), then the line snaps back.
- Each prediction sampled its stretches at `t0 + k·span/160` from the vessel's current time, so every chord slid along the curve at each new prediction.

The spheres of influence were always shown in the map view. Around a planet or moon they are large wireframe globes, and from inside one they cover the whole screen with lines. KSP shows them only on demand.

## Decision

1. **Frames.** A predicted stretch around body B, for a vessel now in the sphere of body A, is drawn:
   - at B's current centre when B is A or one of A's parents (the path around the planet moves with the planet);
   - otherwise at A's current centre plus where B will be relative to A when the stretch starts (a moon encounter hangs where the moon will be, seen from the planet now; KSP's encounter ghost).

   `MapPath.frame` and the renderer's optional `MapPathSegment.frame` carry this. The node markers, handles, encounter and apsis labels use the same frame.
2. **Sampling.** Stretches are sampled on a grid fixed in sim time. The step is the power of two seconds nearest span / 160, plus the two ends. A prediction made a moment later puts its interior points exactly where they were. `MapPath.times` holds each point's time.
3. **Spheres of influence** are a map filter layer, `soi`, **off by default**. They are remembered with the other filters (ADR 0242). A saved value without `soi` reads as off. The encounter ghost spheres follow the same switch.
4. **No crash from the solver.** The universal Kepler solve uses Vallado's hyperbolic first guess and a safeguarded Newton step (bisect when Newton leaves the bracket or does not halve the step). An unconverged step ends the path segment like a horizon instead of reaching the page. The map, apsides and plane nodes skip a point the solver cannot reach.

## Alternatives considered

- **Re-predict every frame.** This removes the lag but not the sliding chords, and costs a patched-conic prediction per frame during warp.
- **Draw everything relative to the root (sun) as before, with predictions at a higher rate.** The planned stretch would still hang where the planet will be at the node.
- **Sample by eccentric anomaly, like `sampleOrbit`.** This works for one closed conic. Stretches are pieces of any conic between two times, and the pick-by-time code needs times.
- **Hide the spheres entirely.** The owner asked to keep them as an option.

## Consequences

- The data of `MapPath` changes: `frame` and `times` are new, and a stretch has about 110–230 points instead of exactly 161. `offset` stays as the predicted centre and is the fallback when the snapshot does not list the body.
- Picking a node's time treats two passes of a looping orbit within 3 px as the same place, because their chords sag differently now (`SAME_PLACE_PX`).
- Players who want the spheres switch them on once in the map filter bar.
