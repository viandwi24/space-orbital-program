# 0024 — Surface-fixed rails for controlled vessels at rest on the ground

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/016-landed-vessels-on-rails.md

## Context

Time warp needs every vessel on rails (ADR 0017). A controlled vessel standing on the ground (the rocket on the pad, a lander after touchdown) stays in flight for ever, because flight -> rails needs a stable orbit (ADR 0017) or uncontrolled debris (ADR 0021), so `warp` is refused with "time warp needs every vessel on rails" and a player cannot wait for an orbital window. Kepler rails cannot hold it: the conic through its inertial state (it moves at 174 m/s with the ground) dips below the surface and the vessel would fall through it. The planet rotates (ADR 0017), so "stay put" means "turn with the body".

## Decision

**A new rails kind, `surface`.** `RailsState` gets `{ kind: 'surface'; r; q }`: the centre of mass `r` and the root orientation `q` in the body-fixed frame. The body-fixed frame is the inertial (BCI) frame rotated by `omega * t` about +Y, the rotation the snapshot already reports for the body, so `r_BCI = Ry(omega t) r`, `v = omega x r`, `orientation = Ry(omega t) q`. No elapsed time is stored: it is exact for any warp length (float64 `omega * t` keeps 1e-9 rad at 1e6 s). A kind (not a flag on `elements`) because `railsMotion`, `rebaseRails`, the snapshot and `splitVessel` all dispatch on the kind, and a flag would allow the nonsense combination "elements + surface".

**Going on rails.** A controlled vessel (`isControlled`) that is `landed` (contact with its ground tile), had no force or torque applied by a module (`idle > 0`), and is at rest relative to the ground (centre-of-mass speed relative to the ground at that point `< 0.05 m/s`, angular velocity relative to the planet's `< 0.01 rad/s`) for `SURFACE_REST_TIME` = 2 s goes on surface rails (`vessel:mode-changed`, reason `at rest on the ground`). The count (`VesselState.rest`) restarts whenever any condition fails, so a vessel that is still sliding or tipping stays in flight, and a vessel that only just touched down needs 2 s of quiet after the contact noise. Uncontrolled vessels are excluded: debris at rest on the ground is removed after 10 s (ADR 0021 rule 3) and that stays. Tilt is not a criterion: a vessel lying on its side, at rest, is as stable as one standing (rigid body on a plane); what matters is that it does not move. The vessel's body, its tile and, if it was the last one, its physics frame are released (`leaveFlight`).

**Waking.** Exactly the existing rule for on-rails vessels (`ensureFlight` in `commands.ts`): `throttle` > 0, a non-zero `attitude`, `stage` and `action`, at warp 1, with a free frame. No new command or rule. The body is created at the rails pose (centre of mass and orientation re-derived at the current `t`, i.e. exactly where the ground has carried it), with the flight frame moving with the ground there, linear velocity relative to the frame zero and **angular velocity `omega` about +Y** (a vessel at rest on a planet turns with it; frame axes are inertial). The ground tile is created on the first step as for any vessel near the ground, and `landed`/`rest`/`idle` restart (`idle` 0, so a woken vessel that does nothing is back on rails after 2 s of rest, as for orbits). Because the pose the vessel was put on rails in is the contact pose, nothing penetrates or hangs: no fall, no impact damage, no pop. Measured bounds are in the plan's criteria.

**Hysteresis** is the asymmetry of the two rules: going on rails needs 2 s of rest, leaving it needs a command; there is no state in which the vessel flips back and forth, and the ground tile band (300/400 m, ADR 0019) is irrelevant on the ground.

**Snapshot.** A surface vessel is `mode: 'on-rails'`, `position` and `orientation` are the root part's pose in BCI now (they turn with the planet), `velocity` is the root part's `omega x position` (so ground-relative velocity is exactly zero), there is **no `orbit`** (the conic would be an arc into the planet) and the new optional field `VesselSnapshot.surface?: boolean` is `true`. A host can tell it from a near-parabolic orbit (also no `orbit`) by that flag and place it with `bodies[].rotation`. API 0.1.4 -> 0.1.5 (additive).

**Ground vessels that split on rails** (a rails `detach` hook) keep surface rails for the piece that keeps the vessel; the new piece gets a Kepler state and, being debris, is reaped.

**What the old "warp refused on the pad" test becomes.** `warp.test.ts` loaded the two-stage vessel on the pad and asserted a refusal naming "in flight". That still holds for the first 2 s and the test (which warps immediately) is unchanged apart from a comment; the tests that asserted the vessel stays in flight for 30-60 s (`debris.test.ts` "controlled vessel at rest on the pad", `ground.test.ts` 60 s stand, `sim.test.ts` pad drift) were asserting the very behaviour this plan removes, and now assert `on-rails` + `surface` and that warp is accepted. `sim.test.ts` "second vessel within range" runs 1 s instead of 2 s so it still looks at flight mode.

## Alternatives considered

- **Treat the pad vessel as "very stable" for Kepler rails** — falls through the ground and ignores rotation.
- **Keep it in flight and let warp run flight steps** — the cost of warp becomes the cost of 50 Hz physics; breaks the invariant of ADR 0017 (rejected already in ADR 0021).
- **A flag on the vessel (`anchored`) next to elements** — two sources of truth; every consumer must remember to check the flag first.
- **Store latitude, longitude, heading, height** (the draft's suggestion) — derived quantities need trigonometry at both ends and lose tilt/roll; the body-fixed vector and quaternion are exact, and the lat/lon of a host is a function of `r`.
- **Wake on proximity or "anything changed"** — commands are the existing, tested wake path.
- **Surface rails for debris at rest too** — debris is removed (ADR 0021); keeping it would make time warp carry dead stages around.
- **Include tilt/slope thresholds** — no terrain (flat tile on the sphere), so every contact pose that is at rest is stable.

## Consequences

- A player can warp on the pad and after landing. Wake-up is the same commands as from orbit.
- Vessels on surface rails have no colliders: a flight vessel passing through a parked one would not hit it, and a vessel woken inside another (two on one pad) is not handled. Known limitation; collisions between vessels are not modelled anyway (STATUS known issues).
- Part temperature is plain part state and keeps cooling on rails (ADR 0023); nothing hits a parked vessel.
- Terrain (heights) would need `r` to stay on the surface; the stored vector already is a position, so it carries over.
- The web client / renderer should read `VesselSnapshot.surface` for a "landed" label and not draw an orbit for it; the renderer places it from `position`/`orientation` as for any vessel.
