---
id: 361
title: "Shuttle landing and re-entry: retractable gear, a drag chute, a Re-entry SAS mode, roll held in pointing modes"
status: done
owner: "part visuals session (Claude)"
depends: [356]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 361 — Shuttle landing and re-entry

## Goal

The owner's requests for the Wayfarer orbiter (2026-10-22, relayed):

- landing gear that comes down like an aeroplane's;
- a brake chute;
- a stable re-entry;
- on SAS prograde, the orbiter should fly straight. The owner's screenshot (`refs/owner-shots/shuttle-prograde-tilt-2026-10-22.jpg`) shows it banked and yawed left.

## What was wrong

- **The control frame was right.** The orbiter's root (`orbiter-nose`) has +Y along the fuselage and +Z out of the roof.
- **SAS pointing modes did not hold roll.** They aim the nose and only damp the roll rate, so any disturbance left the craft banked.
- **The orbiter is stable only nose first.** Hands-off from 40° it swings from +63° to −21° and settles near 5°: the wings sit far aft, so nothing but the controls holds a belly-first attitude.
- **No SAS mode could hold a re-entry attitude.**
  - SAS Hold keeps an inertial attitude, so as the path curves round the planet, the angle of attack grows. From 40° it reached 138° by 13 km: flying backwards.
  - SAS Prograde comes in nose first, at about 4°.

## Steps

1. **SAS (ADR 0303).**
   - In the air, every pointing mode keeps the roll it took over with, measured from local up about the nose (`SasState.roll`; the player's keys reset it). In space the roll is only damped, as before.
   - Prograde and retrograde in the air level the wings while the nose is off the vertical.
   - A new mode, `reentry`, holds the nose `REENTRY_AOA` (40°) above the airflow, wings level, from orbit down. It has a HUD button and the key action `sasReentry` (Alt+R).
2. **Gear.** `stock.wheel` gains `retractable`, `deployed` (a build setting) and `deploySpeed`.
   - Stowed, the wheel has no collider.
   - The Landing gear group (G) lowers and raises it; it will not lower above `deploySpeed`, and its panel says why.
   - New parts: `stock.orbiter-gear` (twin wheels, brakes) and `stock.orbiter-gear-nose` (steers), shown behind black tile doors, with a strut that folds out.
3. **Brake chute.** `stock.drag-chute`: a parachute pack with a 90 m² canopy that opens at once near the ground, waits above 100 m/s, and cuts away. Mounted turned over at the base of the fin, it streams aft.
4. **Wayfarer:**
   - the nose gear under the cabin and two main gear under the bay's aft corners, moved in onto the flat belly;
   - the brake chute beside the fin;
   - format version 4, for the offsets.

## Acceptance criteria

- [x] SAS prograde in the air from a 20° bank: |bank| < 3° (0.30°) and |sideslip| < 2° (0.01°) over a minute.
- [x] Re-entry from 75 km, 2 250 m/s, on SAS Re-entry down to 30 km:
  - the angle of attack stays within 5.0° of 40°;
  - the bank stays within 0.1°;
  - no part is lost;
  - the peak temperature is 939 K, on the wings.
- [x] Roll-out from 91 m/s on three lowered gear legs with the brakes on: 445 m without the chute, 304 m with it fully open.
- [x] Wayfarer still flies to orbit and releases its module.

## Docs checklist

- [x] ADR 0303, STATUS row, journal 361.

## Log

- 2026-10-22: claimed (plan-numbers notes) and done.
- Not done: a headless landing from re-entry to the runway, which needs guidance for the approach. The two halves are tested apart (re-entry to 30 km; the roll-out from 90 m/s).
