# Units, frames, and precision

Decided in ADR 0007. Every package follows this; conversions happen at the edges (UI display, asset import).

## Units

- **SI everywhere** in code and state: metres, kilograms, seconds, newtons, kelvin, radians.
- Display units (km, t, kN, degrees) are a UI concern in `apps/web`.
- Part definitions in mods are also SI. Helpers like `tonnes(3)` or `kN(60)` may exist in the SDK for readability, but they return SI numbers.

## Numbers

- Simulation state uses JavaScript `number` (float64). This is sufficient for positions within a star system at metre precision.
- The physics backend (Rapier) is float32 internally. Therefore flight-mode physics runs in a **local frame** centred on the active vessel (see below); world-scale positions never enter the physics engine.
- The GPU is float32. The renderer uses a **floating origin**: render-space origin is re-centred to the camera's reference body or vessel whenever the camera moves more than a threshold (default 10 km) from the current origin. `@orbital/renderer` implements it (plan 008): render position = `world − origin` computed in float64 and only then handed to Three; the origin snaps to a 1024 m grid (a power of two, so the subtraction is exact); in map view the anchor is the SOI body instead of the vessel.

## Frames

| Frame | Origin | Axes | Used by |
|---|---|---|---|
| **Body-centred inertial (BCI)** | centre of the vessel's current SOI body (ADR 0051; the root rests at the system origin, a child moves on its Kepler orbit around its parent; the stock root is the Sun since plan 122, ADR 0119) | right-handed; +Y is the system's north (a body without `rotation.pole` has its pole on +Y); +X toward the reference direction at epoch | `kepler`, on-rails state, map view |
| **Local physics frame** | a point that moves at constant velocity with the frame: `bci = origin + local`, `bciVelocity = frame.velocity + localVelocity`; created at the focus vessel's centre of mass, re-anchored (origin and velocity) when the focus root is > 1 km from the origin (plan 007, ADR 0017) | same orientation as BCI | `physics` (Rapier world), flight mode |
| **Render frame** | floating origin (see above) | same orientation as BCI | `renderer` |
| **Body-fixed** | body centre, rotating with the body | +Y the body's own north pole, longitude 0 on +X; turned into BCI by `bodyOrientation(body, t) = q_pole · Ry(W(t))` (plan 085, ADRs 0103 and 0145; `qAboutY(2 pi t / rotationPeriod)` without `rotation`) | surface positions, sites, terrain, surface rails |

Orientation of all frames is identical; only the origin differs. A change of sphere of influence is a translation of position and velocity by the child body's state (`kepler.intoChildFrame` / `intoParentFrame`, ADR 0051); a flight frame is re-based by translating its origin and velocity, local poses stay. Converting between them is a translation of the origin, which keeps conversions cheap and exact enough.

Why +Y up: it matches Three.js defaults and avoids a permanent axis-swap in the renderer. `kepler` treats the orbit normal relative to this convention (see "Orbital elements" below).

## Orbital elements (`@orbital/kepler`, plan 002)

Refinements of the frame convention above, as implemented in `packages/kepler`:

- Angular momentum `h = r × v`. Inclination `i ∈ [0, π]` is the angle between `h` and +Y: a prograde equatorial orbit (counter-clockwise seen from above the north pole) has `i = 0`, a retrograde one `i = π`.
- RAAN and every longitude-type angle are measured **right-handed about +Y, starting at +X**. A right-handed rotation about +Y turns +X toward **−Z**, so the ascending node at `raan = π/2` lies on −Z.
- The textbook (Vallado) frame with +K as the pole maps onto ours by the proper rotation `I = x, J = −z, K = y`. The library converts at the edges of `fromStateVector`/`toStateVector` and otherwise uses the textbook formulas unchanged.
- Hyperbolic orbits have `a < 0`. `raan`, `argp` are wrapped to `[0, 2π)`. Elliptic mean anomaly `m0` is wrapped to `[0, 2π)`; hyperbolic `m0` is unbounded.
- Degenerate orbits: circular (`e < 1e-11`) → `argp = 0` and the anomaly is measured from the ascending node; equatorial (`sin i < 1e-11`) → `raan = 0` and `argp` is the longitude of periapsis; both → `raan = argp = 0` and the anomaly is the true longitude.
- Near-parabolic orbits (`|e − 1| < 1e-8`) cannot be expressed with a semi-major axis: the element functions throw `KeplerError`. `propagateUniversal(r, v, μ, dt)` propagates a state vector for any conic, including this case.

## Rotations

- Quaternions `{x, y, z, w}` (unit length) in state. Euler angles only at UI edges.
- Angular velocity in rad/s, body frame of the vessel.
- Part transforms in snapshots: position relative to the vessel root in BCI axes, orientation absolute (`simulation.md`).
- Body rotation: `2π / rotationPeriod` about +Y from t = 0; surface placements: local X east, Y up, Z south.

## Time

- Simulation time `t` is seconds since the world's start (float64). The world's **epoch** (`WorldInfo.epoch`, `packages/core/src/calendar.ts`, ADRs 0103 and 0141) says which instant `t = 0` is: whole SI days plus a fraction from J2000.0 (2000-01-01 12:00:00 TT, JD 2451545.0) on the system's time scale (TT for a Gregorian system, plain SI seconds for a fictional one). Conversions carry (days, seconds) and normalise; never add `t` to a Julian date in one float.
- Seasons (plan 122, ADR 0119): the stock home planet's tilt is the inclination of its orbit (its pole stays +Y), so the sun's declination over its equator (`subSolarLatitude`, core) swings between +23.44° and -23.44° over the year of 9.2 Ms.
- Calendars: the root body's `calendar` is `gregorian-utc` (UTC through the IERS leap-second table at the display edge, `research/time-scales.md`) or `fictional` from a home body (its solar day; its orbital period as the year, none while it orbits nothing). The sim never reads a clock; the page (HUD date) and the script host (`date()`) format dates.
- Fixed step `dt = 0.02 s` (50 Hz) in flight mode. On rails, propagation is analytic and `dt` may be large (time warp).
- No wall-clock access inside `sim`.

## Identifiers

- Every registered thing (part, module, resource, body, plugin) has a string id `"<plugin>.<name>"`, e.g. `"stock.engine-lv"`. Lower-case, kebab-case name, plugin id as prefix.
- Entities in the world get numeric ids from the world; never reuse during a session.
