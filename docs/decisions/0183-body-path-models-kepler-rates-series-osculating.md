# 0183 — Body path models: fixed conic, elements with rates, periodic series; osculating elements for conic consumers

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 123
**Builds on:** ADR 0103 point 5 (paths beyond fixed conics), 0095 (trajectory provider), 0141 (world epoch), 0007 (frame, +Y pole).

## Context

Every body follows a fixed conic (`orbit`, on the world's time). Real systems (the Sol pack, 124) need planets whose elements drift (JPL Level A) and a Moon that a conic cannot follow. Open: the data shape, the time axis, the frame, where the evaluators live, how the sim caches them, and what code that needs a conic gets.

## Decision

1. **`orbit.model`** is `kepler` (default), `kepler-rates` or `series`. The six classical elements stay required in every model: they are the mean conic, which sizes the sphere of influence and serves any tool that has not learned the model.
2. **`kepler-rates`.** The elements are taken at `epoch`, in seconds from J2000.0 (TDB). `rates` gives SI rates per second for `a`, `e`, `i`, `raan` and `argp`, and `meanMotion` (rad/s), the rate of the mean anomaly. At time τ, `x = x₀ + ẋ (τ − epoch)` and `M = m0 + meanMotion (τ − epoch)`. The state is that osculating conic's position and velocity. `levelAElements(row)` turns a JPL Table 1 row into this form: au to metres, degrees to radians, per century to per second, `argp = ϖ − Ω`, `m0 = L − ϖ`, `meanMotion = L̇ − ϖ̇`.
3. **`series`.** Ecliptic longitude, latitude and horizontal parallax of the body seen from its parent are periodic series in Julian centuries from J2000, in degrees, as the Astronomical Almanac writes them:
   - longitude: `base [l₀, l₁]` plus sine terms `[A, φ, f]`;
   - latitude: sine terms;
   - parallax: a base plus cosine terms.

   The distance is `parentRadius / sin π`. The velocity is a central difference over ±30 s.
4. **Frame.** The J2000 models are written in ecliptic coordinates, and the game frame is that ecliptic with +Y as its pole. Kepler's convention (ADR 0007: I = x, J = −z, K = y) maps the elements unchanged, and a series' ecliptic vector `(x, y, z)` becomes `(x, z, −y)`.
5. **Time.** `kepler` keeps the world's time `t`. The J2000 models take `τ = t + epoch offset`, the world's epoch (ADR 0141) as seconds from J2000. Changing a world's epoch moves those bodies to the right date, and leaves fixed-conic worlds as they are.
6. **Where it lives.** The evaluators (`bodyPathState`, `osculatingElements`, `levelAElements`) are in `@orbital/kepler`, and the schema is in core.
   - The sim's `stateInParent` dispatches on the model and caches the state per time, as it already does.
   - Code that needs a conic takes `osculatingElements(path, μ, now)`: the patched-conic body list (`maneuver.ts`, the trajectory provider of ADR 0095) and the target's approach. That conic is good for a short look ahead; a crossing is still refined by the sim's bisection on `stateInParent`.
7. **Not yet.** Scripts' `bodies[].state`, the VAB trip planner and the renderer read the mean conic. No stock body uses a new model, so nothing changes until 124 brings one. Table 2's long-span terms and DE440 (125) are later.

## Alternatives considered

- **Rates per Julian century in the data**, as JPL prints them: rejected for the stored form. Everything else in the sim is SI per second; the helper converts JPL's rows.
- **A full lunar theory (ELP-2000/82):** deferred. It is about 120 terms with no free primary source to check against here. The series format takes it as data when a pack needs it.
- **Bodies on the world's time for every model:** rejected. Real elements are tied to J2000, and an epoch change must move them.

## Consequences

- **Mod API:** `orbit.model`, `orbit.rates`, `orbit.series`; kepler `bodyPathState`, `osculatingElements`, `levelAElements`; additive, `API_VERSION` patch bump.
- **Behaviour:** none for stock or existing worlds (all `kepler`).
- **Follow-ups:** 124 (Sol pack data and the planner, scripts and renderer on the models), 125 (DE440).
