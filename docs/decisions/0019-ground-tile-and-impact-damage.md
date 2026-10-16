# 0019 — Ground tile, contact readback and impact damage

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/012-ground-contact-landing.md
**Supersedes:** the "Ground" point of [0017](0017-flight-model.md) (sphere clamp, pad hold, 10 m/s crash rule); the rest of 0017 stands.

## Context

Plan 007 idealised the ground: a sphere clamp that zeroes the velocity relative to the rotating ground, a pad hold that pins a standing stack, and uncontrolled vessels hitting at more than 10 m/s are destroyed. A vessel could not topple, slide, tip on legs or lose a part. Since plan 011 a vessel is one compound body with a box collider per part, so Rapier can do real contact for all parts. Constraints: Rapier is f32 (so colliders must sit near the local origin), the planet is a 600 km sphere (no height data, a huge collider is out of the question), the planet rotates (174.5 m/s at the equator), and the PhysicsBackend has no contact readback.

## Decision

**Ground representation: a kinematic ground tile per vessel near the ground**, not a per-step height query. For each flight vessel whose centre of mass is below 300 m altitude (removed again above 400 m) the sim keeps a kinematic, velocity-based body with one box collider (half extents 200 x 100 x 200 m) whose top face is the tangent plane of the reference sphere under the vessel's centre of mass (radius `R` along the COM direction). Each step, before the backend step, it is re-positioned in the local frame (`R·up − frame.origin`, orientation: +Y up, +X east) and given the ground's velocity at that point relative to the frame (`ω × p − frame.velocity`) and the planet's angular velocity, so friction sees the rotating ground. The flat tile deviates from the sphere by `d²/2R` (0.03 m at 200 m from its centre); the tile follows the vessel so what matters is the few tens of metres around it. A 100 m half thickness keeps a fast vessel from tunnelling (200 m per step is 10 km/s). Friction 0.8 on tile and parts, restitution 0.

**Backend (additive):** `BodyDesc.friction` and `BodyDesc.restitution` (applied to all colliders of the body), and `PhysicsBackend.contacts(a, b): ContactPoint[]` returning, after a step, every solver contact point between two bodies as `{ shape, point, distance }` (collider index within `a`, local-frame world point, signed distance). The mock returns none. Chosen over contact-force events because it needs no event queue, is deterministic and gives the contact location, which the damage rule needs.

**Impact damage.** Each part has an `impactTolerance` (m/s; `PartDefinition`, optional, default 6 in the sim). After the step, for every contact point with distance <= 0.02 m the closing speed is computed from the velocities *before* the step (the step in which the contact first appears is the one that absorbs the approach speed) relative to the ground at that point, along the tile normal. A part's impact speed is the maximum over its contact points; a resting contact has a closing speed near zero. If it exceeds the tolerance the part **breaks off** (it is cut from every neighbour with `splitVessel`, one new vessel per remaining piece, and the part itself flies on as debris); if it exceeds twice the tolerance it is **destroyed** (removed from the world; a vessel left empty is destroyed with `vessel:destroyed`). The event `part:damaged { vessel, part, definition, speed, outcome }` reports both. This replaces the 10 m/s rule; the data hook (`impactTolerance`) and the event are the "re-entry survival hooks" a heating model (draft plan 014) will use.

**Landing legs are a module.** `ModuleDefinition.colliders?(config, state): ModuleCollider[]` (`{ offset, halfExtents }` in the part frame) adds collision boxes to the part; the physics shape of a part is its own box plus these. The sim records a signature of the collider set per vessel body and rebuilds the body (same pose, centre-of-mass velocity and angular velocity, as for a split) when a dispatched `action` or `stage` changed it. A change made by an `update` hook takes effect at the next action, stage or split. `stock.landing-leg` adds four foot boxes when deployed. `API_VERSION` 0.1.2 -> 0.1.3 (additive).

**The pad hold is removed.** A stack stands on the tile by friction (a rigid vessel on a flat plane does not topple on its own); `placeOnSurface` accounts for deployed feet when finding the lowest point.

## Alternatives considered

- **Per-step height query + the old clamp.** No toppling, no tipping on legs, no friction; it is what we are replacing.
- **One huge static collider.** f32 at 600 km is useless; a sphere or mesh of that size also makes the narrow phase meaningless.
- **Fixed (not kinematic) tile.** Friction would see the ground at rest in the local frame; the ground moves at up to 174 m/s relative to a frame that follows the vessel, and a vessel at rest on the ground would be dragged.
- **One tile per frame.** Debris up to 2.5 km away from the tile centre would hover 0.5 m above or sink into a flat tile; a tile per vessel keeps the curvature error under a few centimetres.
- **Contact-force events for damage.** Force spikes depend on dt and solver softness, so thresholds would not be in physical units; impact speed is what a mod author can reason about.
- **Leg suspension / spring.** Out of scope; a rigid foot with an impact tolerance is enough to make landings meaningful.

## Consequences

- A vessel resting on the ground now has real contact noise (sub-mm/s); tests use thresholds, not equality. `landed` comes from contact points.
- One extra body and a few `contactPair` calls per vessel near the ground per step.
- Damage splits vessels mid-flight (deterministic, same machinery as staging). Part-to-part collision damage (a stage hitting its parent) is not modelled.
- Terrain (heights) would replace the tile's plane by a height-aware shape; the tile interface in `frames.ts` is where it plugs in.
- Follow-ups: draft plan 014 (re-entry heating).
