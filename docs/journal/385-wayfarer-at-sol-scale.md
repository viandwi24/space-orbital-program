# 385 — The Wayfarer at Sol scale

**Plan:** [plans/385-wayfarer-at-sol-scale.md](../plans/385-wayfarer-at-sol-scale.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0365](../decisions/0365-ascent-holds-max-q.md)

## What it was

Traced on Sol rescaled (a scratch test that printed the nose pitch and the angle of attack every 2 s): the stack lost its attitude **before** the boosters went, not after. The ascent's pitch program is a function of altitude only; a stack at a thrust-to-weight of 1.5 and more was at 880 m/s at 9 km (about 160 kPa), the angle of attack went 13°, 53°, 91° between 42 and 54 s, and the flight never recovered. A first guess (a nose-below-horizon command in the insertion stage) was wrong: the stage was still the ascent.

## What was done

- **The pilot knows the air** (`PilotBody.air`, filled by `sim/pilot-facts.ts` from the body's air model) and the Ascent autopilot throttles through max-Q (`maxQThrottle`: full below 40 kPa, down to 0.35 at 60 kPa; in the ascent and the insertion while in the air). Unit tests: `mods/guidance/test/max-q.test.ts`.
- With the attitude held, the same stack was short of propellant (3.5 km/s when the tank ran dry): the half-size Shuttle (192 t of propellant against the real 736 t) cannot reach a rescaled orbit. The blueprint's Sol systems now carry more: **rescaled**, two 5 m tanks under the external tank on a 5 m engine plate (J-2 class); **1:1**, three tanks and a second booster pair (thrust-to-weight at liftoff was under 1 with one pair). Built by `wayfarer(content, { coreTanks, boosterPairs })` in `missions.ts`, baked (ADR 0316).
- `blueprint-systems.test.ts`: the Wayfarer is `goal` in stock (periapsis 71 km), Sol rescaled (55 km) and Sol 1:1 (106 km). All the other blueprints still reach their goals with the max-Q throttle (the whole file, 157 tests with the mission flights, `stock-blueprints` and `missions`).

## Numbers

Sol rescaled before: the attitude lost at 50 s, the stack falling back; after the throttle: the attitude held, 3.5 km/s then dry; after the Sol design: orbit. Sol 1:1: three tanks with one booster pair did not leave the pad (the engine plate broke at 67 s); with the second pair it flew to a 106 km periapsis.

## Left

The 40 and 60 kPa lines are starting numbers (ADR 0365). Re-entry and landing of the Sol-scale Shuttle are plan 361's.
