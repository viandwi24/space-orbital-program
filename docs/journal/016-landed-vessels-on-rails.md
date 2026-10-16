# 016 — Landed vessels on surface-fixed rails

**Plan:** plans/016-landed-vessels-on-rails.md · **Session(s):** surface-rails session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The draft was refined to `ready` at the human's request (ADR 0024 answers its open questions), then implemented. No scaffolding, no new dependencies, no change to `createSim`'s API. Core got one additive snapshot field (`VesselSnapshot.surface`, API 0.1.4 -> 0.1.5).

| Area | Change |
|---|---|
| core | `VesselSnapshot.surface?: boolean`; `API_VERSION` 0.1.5 |
| sim `state.ts` | `RailsState` kind `surface` (`r`, `q` in the body-fixed frame); `VesselState.rest` |
| sim `orbit.ts` | `surfaceRails`, `orientationOf`; `railsMotion` and `rebaseRails` handle the kind |
| sim `modes.ts` | `trackRest` (landed, force-free, at rest relative to the ground), `surfaceEligible`, `toSurfaceRails`; `autoRails` third branch; `wake` re-derives the orientation and creates the body with angular velocity `omega` |
| sim `frames.ts` | `enterFlight(..., angular)` |
| sim `snapshot.ts` | orientation from `orientationOf`; surface vessels report root-part velocity, `surface: true`, no `orbit` |
| sim `vessel.ts` | `splitVessel` keeps surface rails for the surviving piece; `rest` field on both vessel states |
| sim `constants.ts` | `SURFACE_REST_TIME` 2 s, `SURFACE_REST_SPEED` 0.05 m/s, `SURFACE_REST_SPIN` 0.01 rad/s |
| tests | `test/surface-rails.test.ts` (14); updated `debris`, `ground`, `sim`, `warp` tests |
| docs | ADR 0024, `simulation.md`, glossary |

## Numbers

- Pad vessel (two-stage): on surface rails at t = 2.00 s (the rest count starts at the first step). `warp 1e6` over 1e6 s of simulated time runs in 67 ms of wall time.
- Co-rotation over 1e5 s: body-fixed position within 1e-6 m, orientation within 1e-9, ground-relative velocity below 1e-6 m/s (it is exact: nothing is integrated).
- Wake after 77 000 s of warp: no pop (< 1 mm, < 1e-6 m/s), then over 8 s max displacement on the ground 5.0e-4 m and max ground speed 1.2e-3 m/s; no damage; back on rails 2 s later.
- Ascent after 25 000 s on the pad: apoapsis 111.83 km, periapsis 76.18 km, e 0.0257, 217.6 s after wake (plan 007 scenario: 111.87 / 76.18 / 0.0257 / 217.6 s; the 40 m apoapsis difference is Rapier f32 and the different planet phase at launch).
- Lander (plan 012): on surface rails within 5 s of touchdown, 6 parts, warp 1000 for 5e4 s keeps it within 1e-6 m of its place.

## What surprised me

- **Snapshot velocity convention.** Flight snapshots report the root part's velocity, Kepler rails the centre of mass's. For a vessel on the ground the 3.7 m between them is `omega x d` = 1 mm/s, enough to fail a "ground-relative velocity < 1e-6" check; surface rails report the root part's, so ground-relative velocity is exactly zero.
- **Angular velocity at wake.** Frame axes are inertial, so a vessel at rest on the planet turns at `omega`. The pad load has always started it at zero and let friction catch up (invisible: 2.9e-4 rad/s); a woken vessel starts at `omega` so the first step is already consistent.
- Four existing tests asserted the very behaviour removed (a pad vessel stays in flight for 30-60 s); they now assert surface rails and warp. `warp.test.ts`'s refusal still holds for the first 2 s, and "second vessel joins the frame" runs 1 s instead of 2.
- Mutation check: rotating by `0.999999 * omega * t` in `railsMotion` fails the co-rotation, wake and lander tests (restored).
- Plan 017 was taken by another session while this ran; ADR number 0024 was free.

## Decisions

ADR 0024: `surface` rails kind (body-fixed COM and orientation), rest rule instead of tilt rule, wake via the existing commands, `omega` angular velocity at wake, no `orbit` and a `surface` flag in the snapshot, debris unaffected.

## For the web client and the renderer

- `VesselSnapshot.surface === true` means `mode: 'on-rails'`, fixed to the ground, no `orbit`: show "landed", draw no orbit/trajectory (map view should skip vessels with no `orbit`), and keep placing the vessel from `position`/`orientation` (they turn with the planet, matching `bodies[0].rotation`). Anything that read `mode === 'on-rails'` to mean "in orbit" (HUD, map) must check `orbit`/`surface`.
- A pad vessel is in `flight` for its first 2 s and again 2 s after any command that wakes it, so the HUD warp control can be enabled once `mode` is `on-rails`; the refusal text "time warp needs every vessel on rails; in flight: ..." is unchanged. The web launch flow (throttle + stage) wakes it with no change.
- Plan 015's script runner issues the same commands, so scripts wake a parked vessel the same way (not tested here: the other session's work was uncommitted while this ran).

## Open questions / follow-ups

- No colliders on rails: a flight vessel can fly through a parked one. Needs collisions between vessels (a future plan), same as everything else that is not ground contact.
- Rest thresholds are tuning knobs; if terrain with slopes arrives, rest on a slope needs a friction/tilt check.
