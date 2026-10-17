# 085 — Body orientation as pole times spin (no behaviour change)

**Plan:** [plans/085-body-orientation-pole-times-spin.md](../plans/085-body-orientation-pole-times-spin.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-17 · **ADRs:** [0145](../decisions/0145-body-rotation-pole-convention-and-one-function.md) (new), [0103](../decisions/0103-time-calendar-sun-and-the-real-solar-system.md), [0007](../decisions/0007-units-si-float64-floating-origin.md) · **Research:** none

**Status when written: criteria met.**

## What was done

- `packages/core/src/body-rotation.ts`: `bodyOrientation`, `bodyPole`, `bodyAngularVelocity`, `poleQuaternion`, `spinAngle`, `spinRate`, `spinRateAt`.
- `BodyDefinition.rotation`, which is optional: `{ pole?: { ra, dec } | quaternion, w0?, wDot?, periodic?[] }`.
- `API_VERSION` 0.1.41 (0.1.40 went to 103, merged first).
- The sim reads the orientation through `rotationAt(body, t)` and `spinAt(body, t)` in `bodies.ts`.
- The web reads `bodyPole` for the navball horizon and `spinVector` for surface speed and blackout.
- Tests:
  - sim `body-rotation.test.ts`: 6 tests on a tilted home planet, through a `definePatch` on `stock.home`.
  - web `tilted-navball.test.ts`.

## Inventory of the +Y-pole assumptions (step 1) and their replacement

| Site | Was | Now |
|---|---|---|
| `sim/snapshot.ts` body rotation, vessel velocity at rest | `qAboutY(omega t)`, `(0, omega, 0) x r` | `rotationAt`, `spinAt x r` |
| `sim/vessel.ts` `placeOnSurface` | radial turned by `qAboutY(omega t)`, velocity `(0, omega, 0) x com` | `rotationAt`, `spinAt` |
| `sim/terrain.ts` `toBodyFixed`, `groundPlane` | `qAboutY(-omega t)`, `qAboutY(omega t)` | `qConj(rotationAt)`, `rotationAt` |
| `sim/orbit.ts` surface rails in and out, rails orientation | `qAboutY(+-omega t)`, `(0, omega, 0)` | `rotationAt`, `qConj`, `spinAt` |
| `sim/frames.ts` air-relative velocity, heating, ground tile motion, impacts | `(0, omega, 0)` | `spinAt(body, core.t)` |
| `sim/modes.ts` entering flight from the ground, rest tracking, ballistic debris | `(0, omega, 0)` | `spinAt` |
| `sim/stones.ts` stone body pose and motion | `qAboutY(omega t)`, `(0, omega, 0)` | `rotationAt`, `spinAt` |
| `sim/sas.ts` surface reference (`targetDirection`) | `(0, omega, 0)` from a number | a vector; a number still means +Y, so its tests did not change |
| `sim/economy.ts` recovery distance | `qAboutY(-omega t)` | `qConj(rotationAt)` |
| `web/navball-math.ts` `localHorizon`, `attitudeAngles` | north = +Y projected | north = `bodyPole` projected (default +Y) |
| `web/speed.ts` surface velocity, `web/blackout.ts` | `(0, omega, 0) x r` | `spinVector(body) x r` |
| renderer (`scene.ts`, effects, `sun.ts`) | reads `BodySnapshot.rotation` and the angular velocity from rotation deltas | unchanged: it follows the snapshot |
| unchanged on purpose | latitude/longitude, terrain, sites, `groundPlane` east/north (`+Y` in the body-fixed frame), `editor/trip.ts` (rotation speed at the launch latitude, a magnitude), `parts.ts` (`qAboutY(yaw)` is a part's yaw) | |

## What surprised me

- **Nearly everything was already body-fixed.** Only the body-to-inertial turn and the angular-velocity vector had to change, because the body-fixed frame keeps its own pole on +Y (ADR 0145 point 2).
- **The identity default had to compute `W` in the same float order** (`(2 pi / P) * t`) and skip the pole product. With that, all 610 sim and core tests passed unchanged on the first run.
- **`targetDirection` is exported and tested with a number**, so it takes `number | Vec3`.
- A tilted body for tests is one `definePatch` on `stock.home` (`set rotation`); no test body definition was needed.

## Decisions made

- [ADR 0145](../decisions/0145-body-rotation-pole-convention-and-one-function.md): one function in core; the body-fixed frame unchanged; `ra`/`dec` in the system frame; the prime meridian by the shortest turn of +Y onto the pole; bit-identical default; no save change.

## Open questions / follow-ups

- Plan 122 (Sun as root) gives the stock home planet a tilt and checks seasons. Plan 123 converts real equatorial poles into the system frame.

## Verification output

See the plan's Log.
