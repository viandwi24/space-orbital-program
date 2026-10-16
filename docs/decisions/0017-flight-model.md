# 0017 — Flight model: frames, ground, atmosphere, rotation, modes

**Status:** accepted (the Bodies and Reaction wheel torque points are superseded by [0018](0018-rigid-grouping-compound-bodies.md))
**Date:** 2026-10-16
**Plan:** plans/007-sim-loop-flight-onrails.md

## Context

Plan 007 turns `simulation.md` into code and had to settle several points the design left open, mostly forced by Rapier being float32, first-order, with soft fixed-joint chains and no notion of a planet.

## Decision

- **Co-moving local frame.** Flight physics runs in a frame that moves at constant velocity: `bci = origin + local`, `bciVelocity = frame.velocity + localVelocity`; `origin` advances by `velocity·dt` each step. Rapier therefore sees small positions *and* small velocities (at 2.3 km/s a float32 velocity step would be about 3e-4 m/s). The frame re-anchors (origin and velocity reset to the focus vessel's root) when the focus is more than 1 km from the origin. A frame is one backend; all vessels of a cluster share it (a decoupled stage must interact with its parent). `createSim` creates `maxFlightFrames` (default 2) backends up front because `createRapierBackend` is async; a vessel loaded or woken within 2.5 km of a frame joins it, otherwise it takes a free frame, otherwise the command is refused.
- **Bodies.** One box body per part, half extents `(r, h/2, r)` for cylinders (a capsule cannot match parts shorter than their diameter, and the axial extent decides stacking and separation), explicit solid-cylinder inertia, mass recomputed from dry mass plus container contents every step. Fixed joints between attachments, anchors at the attach node positions. Solver iterations are the host's choice via `backendFactory` (tests use 16; the stack was rigid at 16, 64 and 256).
- **Ground.** The reference sphere. Bodies below it are pushed out and their velocity relative to the rotating ground is zeroed (sticky, inelastic). A vessel loaded on the surface is **pad-held**: its bodies are pinned to their pad poses in the rotating ground frame until thrust exceeds weight, because a stack standing on a point contact topples within seconds otherwise. Uncontrolled vessels hitting the ground faster than 10 m/s are destroyed (`vessel:destroyed`); there is no other damage model, no terrain, no legs.
- **Rotation.** The body rotates at `2π / rotationPeriod` about +Y; the launch site co-rotates (about 174.5 m/s eastward at the equator for the home body), the atmosphere co-rotates, `BodySnapshot.rotation` follows. Surface placement stands the vessel nose-up; local X is east, Y up, Z south.
- **Atmosphere.** `p = p0·exp(−h/H)` below `atmosphere.height`, 0 above. `ρ = p / (R·T0)` with `R = 287.05 J/(kg·K)` and `T0 = 288.15 K` (ISA sea-level values, `research/atmosphere.md`), i.e. 1.225 kg/m³ at 101 325 Pa. These are sim constants, not body data; a per-body gas model would be additive. Engines read `p` through `ctx.vessel.ambient`.
- **Drag.** Per part, **per body axis**: `F_i = −½ ρ C_d A_i |v_i| v_i` with `C_d = 0.3` for every part, `A_i` the projected area normal to axis `i` (cylinder: side `2rh` for X and Z, end `πr²` for Y unless the windward end is attached; box: face areas; no shape: 1 m box). A drag vector anti-parallel to the velocity put a large destabilising torque on the nose (the stack tumbled within 25 s even though the wheel could in principle hold it); per-axis drag keeps axial drag on the axis, leaving only second-order cross-flow torque. There is no lift and no fins.
- **Modes.** A flight vessel goes on rails when no module has applied a force or torque for 2 s, it is not in ground contact, and its periapsis radius is above `R + atmosphere.height` (above `R` for an airless body); the orbit is that of the **centre of mass**, attitude is frozen. A `state` placement in such an orbit is created on rails. Rails → flight on a `throttle > 0`, non-zero `attitude`, `stage` or `action` command at warp 1. Warp > 1 needs every vessel on rails and, while warping, flight-needing commands are refused. Kepler's `KeplerError` (near-parabolic) keeps the state vector and propagates it with `propagateUniversal`; radial states have periapsis 0 so never go on rails. On rails `epoch`/`m0` are re-based when `n·(t − epoch) ≥ 2π`. On-rails time advances in chunks of at most 10 s.
- **Reaction wheel torque** is applied to the wheel's own body (not spread over the vessel); the joints carry it. The scripted ascent holds attitude well enough with this, so no extra machinery.
- **Gravity constant.** `GRAVITATIONAL_CONSTANT` moved into core units (and the SDK); stock uses it, bodies carry mass, `μ = G·M`.

## Alternatives considered

- **Capsule shapes for cylinders** — rejected above. **Spheres** — worse.
- **Real contact for the pad (friction at the base corners)** — needs a proper contact model; pad hold is three dozen lines and exact.
- **Atmosphere density as a body field** — would change the body schema for no current consumer.
- **Anti-velocity drag vector** — see above; tried first and discarded.
- **One backend, many frames offset in space** — float32 would be useless at the offsets.

## Consequences

- Physics-bubble limits are explicit (2.5 km join range, 2 frames); a far second vessel in flight is refused rather than degraded. Far-away debris inside a frame loses float32 precision (about 0.06 m at 1 000 km); acceptable for debris.
- Landing, damage, terrain, lift and fins need their own plans (Phase 3); none exists yet.
- Rigid grouping (plan 011) would remove the need for high solver iterations and the pad hold for tall stacks; the pad hold stays useful for the ground-contact idealisation.
