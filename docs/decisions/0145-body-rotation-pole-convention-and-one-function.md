# 0145 — Body rotation: one function, the pole in the system frame, the prime meridian by the shortest turn

**Status:** accepted
**Date:** 2026-10-17
**Plan:** [085](../plans/085-body-orientation-pole-times-spin.md)
**Builds on:** ADR 0103 point 4 (orientation is `q_pole · Ry(W(t))`), ADR 0007 (frames), ADR 0024 (surface rails), ADR 0026 (navball frame)

## Context

ADR 0103 point 4 replaces "every body spins about +Y" with a pole times a spin angle. Plan 085 makes the change with no behaviour change for today's bodies. The plan fixes the data (`BodyDefinition.rotation`) but not three conventions: in which frame `ra`/`dec` are read, what fixes the prime meridian once the pole is known, and where the code reads the orientation.

## Decision

1. **One function in core**: `bodyOrientation(def, t)` (body-fixed to inertial), with `bodyPole(def)` and `bodyAngularVelocity(def, t)` beside it. The sim reads them through `rotationAt(body, t)` and `spinAt(body, t)`. The web reads `bodyPole` for the navball horizon and `spinVector` for surface speed and blackout. The renderer needs no call: it already takes `BodySnapshot.rotation`.
2. **The body-fixed frame does not change**: +Y is the body's own north pole and longitude 0 is +X. Latitude, longitude, terrain, sites, the ground tile's east and north, and surface-rails states all stay body-fixed, so none of them changes; only the body-to-inertial turn and the angular-velocity vector do.
3. **`pole: { ra, dec }` is read in the system frame** with the latitude/longitude convention (+Y the system's north, `ra` 0 on +X, right-handed). Real data in equatorial coordinates (plan 123) is converted to this frame when it is written. A quaternion pole is also accepted and normalised.
4. **The prime meridian is the shortest turn of +Y onto the pole**, followed by `W(t)`. `w0` sets where the meridian is at t = 0.
5. **Exactly as before without `rotation`**: `W = (2 pi / rotationPeriod) t` is computed in that order, with no pole product, so every orbit, placement and save is bit-identical (all 600+ sim and core tests unchanged). The orientation is a function of time, so the save format is unchanged.

## Consequences

- `BodyDefinition.rotation` is additive (`API_VERSION` patch).
- Plan 122 gives the stock home planet its tilt around a Sun. Plan 123 writes real poles and periodic terms.
- Code that wants "north" in the inertial frame must take `bodyPole`, never +Y. The journal of plan 085 lists every replaced site.
