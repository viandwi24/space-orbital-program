# 0083 — The trip planner: a delta-v map from body data, laid over the stages

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/034-vab-extras-mod-categories-trip-planner.md
**Research:** research/delta-v-map.md

## Context

The VAB compared the vessel with one number: orbital speed plus a flat 1 300 m/s of losses minus the rotation, for one target. A rocket for the moon, or a mod body, could not be judged. The stage editor already computes exact per-stage delta-v (sea level and vacuum).

## Decision

1. **Destinations come from the bodies.** `destinationsOf(bodies)` (`apps/web/src/lib/editor/trip.ts`, pure): for the home body (`bodies[0]`, the launch body) its low orbit and escape; for every body whose `parent` is the home body and that has an `orbit`: transfer, orbit, landing, and the way back. A mod body appears without code. Not offered: bodies of other parents, bodies without an orbit or inside the home low orbit, bodies the reference rocket cannot lift off from.
2. **Legs.** Transfers and the escape burn are vis-viva/Hohmann; capture and ejection are the hyperbolic burn `sqrt(v_inf^2 + 2 mu/r) - sqrt(mu/r)` with `v_inf` the moon's circular speed minus the transfer ellipse's speed at the moon's radius. Coplanar, circular moon orbit of radius `orbit.a`, impulsive burns. The way back ends in the home atmosphere at half its height (the heat shield brakes, plan 014; an airless home adds a circularising burn).
3. **Climbs and landings by integration, not a constant.** A point mass in the orbital plane, polar coordinates in the inertial frame, thrust acceleration `1.5 x` the home surface gravity on every body (the VAB warns below a liftoff TWR of 1.3), the sim's exponential air with a ballistic coefficient of 15 000 kg/m^2, the body's rotation. Straight up to 40 m/s, then a gravity turn from an initial tilt scanned from 0.5 to 89.5 degrees (refined to 0.05), cut-off when the apoapsis reaches the orbit, circularisation at the apoapsis (coast drag ignored). The cheapest tilt wins. A landing costs the same as the climb (drag credit ignored: conservative). Home climb to 80 km: 3 343 m/s (journals 006 and 044: about 3 400); the stock moon's landing from 48 km is 645 m/s (a climb of 190 km to 238 km radius costs the potential energy, about 600 m/s). The low orbit of a body is 10 km over its atmosphere, a quarter of the radius when airless.
4. **Stages.** `planTrip` burns the stages in firing order across the legs; the first stage of the report counts at sea level on an atmospheric leg (the climb) and in vacuum elsewhere; a stage partly used keeps the rest in proportion. The result names the stage on each leg, what is short and what is spare. `trip-view.ts` reduces it to the states the strip draws (empty, no propulsion, short, covered).

## Consequences

- The old `tripDeltaV`, `TRIP_TARGETS`, `LOSS_ALLOWANCE` and `ascentDeltaV` are deleted (replace, do not version).
- The map is a guide, not a promise: the reference acceleration is not the design's, a hand-flown landing spends more than a perfect one (journal 044: 780 against 560 for a crude script), and plane changes are not counted. The strip says so.
- Per-design ascent simulation (the design's own TWR and drag) and inclined or elliptic moon orbits stay possible additions on the same leg model.
