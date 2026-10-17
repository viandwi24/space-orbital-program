# 0051 — Body hierarchy, frames and SOI transitions

**Status:** accepted (amended by [0095](0095-gravity-model-per-world-and-a-trajectory-provider.md): predictions go through a trajectory provider; and by [0103](0103-time-calendar-sun-and-the-real-solar-system.md): the root is a star and a body may follow a path that is not a fixed conic; the transition rule stands)
**Date:** 2026-10-17
**Plan:** plans/044-moon-and-soi-transitions.md
**Builds on:** ADR 0007 (units and frames), 0017 (flight frames), 0024 (surface rails), 0043 (terrain), 0050 (save format). Research: `research/soi-and-moon.md`.

## Context

The sim had one root body: `core.body` fed gravity, rotation, atmosphere, terrain and rails for every vessel. v1 needs a moon to fly to (ADR 0048). A vessel's `VesselState.soi` already existed and the renderer already places vessels by `soi` body.

## Decision

1. **Bodies form a tree** from `BodyDefinition.parent` and `orbit` (already in the schema). The root rests at the origin of the system frame. A child moves on its analytic Kepler orbit around its parent (the parent's gravity only; the child's pull on the parent is ignored, as in patched conics). `core.bodies` holds, per body: definition, `mu`, `omega`, parent, children (ascending id), SOI radius (`soiRadius(a, m, M)`, Laplace, infinite for the root) and its terrain field. `createSim({ terrain })` as a plain field applies to the root body; a function is asked for every body and may return `undefined`.
2. **A vessel's state is relative to its SOI body** (body-centred inertial, axes shared by all bodies, +Y north of the body: units-and-frames.md). Rails (elements), atmosphere, rotation, terrain, ground tile and SAS reference all use the vessel's SOI body. `BodySnapshot.position` is the body's position in the system frame, so renderers add it to the vessel's.
3. **Transition rule** (checked for every vessel, in ascending id order, after the step): a vessel leaves body `B` for its parent when `|r| > soi(B)`; it enters a child `C` of `B` when `|r - r_C(t)| < soi(C)`. Position and velocity are continuous in the system frame: leaving, `r' = r + r_B(t)`, `v' = v + v_B(t)`; entering, `r' = r - r_C(t)`, `v' = v - v_C(t)`. The test uses the side of the boundary just crossed, so a vessel never flips back at once; one transition per vessel per step (a chain is resolved in the next step).
4. **On rails** the time of the crossing is found by bisection inside the step (at most 10 s) on the signed distance to the boundary (`kepler.findCrossing`, 1 mm), the state is converted at that time and new elements with `epoch` at the crossing replace the old ones. Because rails state is a function of absolute time, nothing else needs integrating.
5. **In flight** the physics frame is re-based: `origin' = origin -/+ r_body(t)`, `velocity' = velocity -/+ v_body(t)`, local poses and velocities untouched (all frames share axes), `frame.soi` and every vessel's `soi` in it change together, gravity of the new body applies from the next step. The vessel that decides is the frame's focus (the one that re-anchors it: first controlled vessel, else the first). A vessel in a frame always has the frame's `soi`; waking a vessel looks for a frame in its own SOI (`acquireFrame(core, soi, ...)`).
6. **Events and time warp.** `vessel:soi-changed { vessel, from, to }` (additive, API 0.1.13). When the vessel is controlled, `core.warp` becomes 1 and the rest of the accumulator is discarded so the player is not carried on at the old rate. Debris changes SOI silently. Time-warp rules otherwise unchanged (warp needs everything on rails).
7. **Rails eligibility** (`isStableOrbit`) and the debris reaper use the vessel's SOI body: periapsis above `R + max(atmosphere, terrain max)` of that body. A path that leaves the SOI is judged by its conic in the current SOI, as a patched-conic sim does.
8. **Placement**: `load-vessel` accepts any registered body in `placement.body`; positions are relative to it.
9. **Save format 2** (ADR 0050 point 6): `body` (one root id) becomes `bodies` (ids of every body of the sim, root first), and each saved frame gains `soi`. Migration 1 to 2 fills `bodies: [body]` and `soi: body`. Resume refuses a save whose bodies are not all registered (`missing-mod`). The moon's position is a function of `time`, so it needs no state.

## Alternatives considered

- **Everything in one system frame** (vessel positions relative to the root always): float64 would hold, but the rails elements, terrain and the renderer's per-body logic all want body-relative state; gravity in a combined frame needs n-body forces. Rejected.
- **Transition at the end of the step, no bisection**: up to 10 s of motion on the wrong side (about 10 km at 1 km/s) changes the encounter geometry visibly in map view. Rejected.
- **Hysteresis band on the boundary**: not needed since the converted state sits on the new side by construction.

## Consequences

- Plan 045 (maneuver nodes) predicts across SOIs with `kepler` primitives plus the same rule; the sim exposes `bodyStateAt` through the snapshot's body positions and the registered `orbit` data.
- Renderer and HUD read `soi` per vessel; telemetry is relative to that body.
- No lunar gravity on the planet's vessels and no planet gravity inside the moon's SOI: standard patched conics, trajectories near the boundary differ from n-body.
