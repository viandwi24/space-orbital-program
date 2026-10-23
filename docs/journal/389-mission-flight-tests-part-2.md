# 389 — Mission flight tests, part 2

**Plan:** [plans/389-mission-flight-tests-part-2.md](../plans/389-mission-flight-tests-part-2.md) · **Session:** Worker B (M5), 2026-10-24 · **Follows:** [309 journal](309-mission-flight-tests.md) · **Split off:** [plan 407](../plans/407-orbiter-runway-landing.md)

## What was done

| Test (`apps/web/src/lib/editor/mission-flights.test.ts`) | Result |
|---|---|
| descent module, sphere capsule, cone capsule re-enter and land | each a heat shield below and three chutes (one main on top, two radial), entry at 60 km and 2 km/s with the base 40° off the flow: base within 15° of the flow in the thick air, down under 8 m/s. With one chute they landed at 9.4 to 11.4 m/s: these pods carry none of their own |
| orbiter glide, Mach 2 at 30 km, nose 8° up, SAS hold | lift and drag from the velocity change less gravity, over 1 s windows: 2.5 to 2.8 before, **3.1 to 3.2 after** the wing change below |
| Selene ascent stage on the moon | the descent stage keeps its legs, the ascent stage leaves on the decoupler; with **RCS on** the ascent autopilot flies it to a 5 × 11 km orbit (its insertion ends within 5 km of the 10 km target) |
| two crewed modules dock | a habitat and a laboratory, each with a probe core and a port, released 0.9 m apart; the merged vessel has the first crew member in the hab and the second in the lab |

## Fixes the tests asked for

- **Delta wing aspect ratio 2.2 → 2.8** (`stock.wing-delta`, area unchanged): the orbiter measured L/D 2.8 at best, the plan wants 3. The wing draws wider by about 13 % (the visual follows the aspect ratio); the other shuttle tests (361) and the glider pass.

## What surprised me

- **Without RCS the ascent stage tumbles.** The cabin has no wheel and no gimbal; a few millimetres of thrust offset turn it slowly over until it flies back into the ground. The test switches RCS on, as a player must; the ascent autopilot does not.
- **The pods have no chutes of their own** (only the Kronos capsule does), so a re-entry test needs them added: one main chute lands them at 9 to 11 m/s.
- Plan 388 was renumbered 389 on main while this was in progress (388 is the Space Center QA leftovers).

## Open questions / follow-ups

- **The orbiter's runway landing is plan 407** (a controller of its own).
- The ascent autopilot could switch RCS on itself when the vessel has no other torque source.
- The glide holds the attitude while the path curves down, so the angle of attack drifts from 8° to about 16° during the 12 s measured: L/D is taken at its steady end.

## Verification output

pending
