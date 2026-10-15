# Units, frames, and precision

Decided in ADR 0007. Every package follows this; conversions happen at the edges (UI display, asset import).

## Units

- **SI everywhere** in code and state: metres, kilograms, seconds, newtons, kelvin, radians.
- Display units (km, t, kN, degrees) are a UI concern in `apps/web`.
- Part definitions in mods are also SI. Helpers like `tonnes(3)` or `kN(60)` may exist in the SDK for readability, but they return SI numbers.

## Numbers

- Simulation state uses JavaScript `number` (float64). This is sufficient for positions within a star system at metre precision.
- The physics backend (Rapier) is float32 internally. Therefore flight-mode physics runs in a **local frame** centred on the active vessel (see below); world-scale positions never enter the physics engine.
- The GPU is float32. The renderer uses a **floating origin**: render-space origin is re-centred to the camera's reference body or vessel whenever the camera moves more than a threshold (default 10 km) from the current origin.

## Frames

| Frame | Origin | Axes | Used by |
|---|---|---|---|
| **Body-centred inertial (BCI)** | centre of the current SOI body | right-handed; +Y is the body's north pole; +X toward the reference direction at epoch | `kepler`, on-rails state, map view |
| **Local physics frame** | the active vessel's root part position at frame creation, re-anchored when the vessel drifts > 1 km | same orientation as BCI | `physics` (Rapier world), flight mode |
| **Render frame** | floating origin (see above) | same orientation as BCI | `renderer` |
| **Body-fixed** | body centre, rotating with the body | derived from BCI by rotation about +Y | surface positions, launch sites, terrain (later) |

Orientation of all frames is identical; only the origin differs. Converting between them is a translation of the origin, which keeps conversions cheap and exact enough.

Why +Y up: it matches Three.js defaults and avoids a permanent axis-swap in the renderer. `kepler` treats the orbit normal relative to this convention.

## Rotations

- Quaternions `{x, y, z, w}` (unit length) in state. Euler angles only at UI edges.
- Angular velocity in rad/s, body frame of the vessel.

## Time

- Simulation time `t` is seconds since epoch (float64).
- Fixed step `dt = 0.02 s` (50 Hz) in flight mode. On rails, propagation is analytic and `dt` may be large (time warp).
- No wall-clock access inside `sim`.

## Identifiers

- Every registered thing (part, module, resource, body, plugin) has a string id `"<plugin>.<name>"`, e.g. `"stock.engine-lv"`. Lower-case, kebab-case name, plugin id as prefix.
- Entities in the world get numeric ids from the world; never reuse during a session.
