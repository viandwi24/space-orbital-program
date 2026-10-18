---
id: 063
title: "Aeroplane gameplay: landing gear, runway, trim, flaps, flight read-outs"
status: in-progress
owner: "Agent 2"
depends: [041, 091, 094, 110]
phase: 3
created: 2026-10-17
updated: 2026-10-18
---

# 063 — Aeroplane gameplay

## Goal

A player can build a winged craft, take off from a runway, fly it with the keyboard and land it. Plan 041 gave the parts and the physics (wings with lift, stall and induced drag; tilt for incidence; control surfaces on wings); this plan makes them a game.

## Context

- Found, not done, in plan 041 (reasons: a plane's gameplay is a plan of its own; 041 stopped at "a craft with wings glides at the glide ratio of its polar").
- ADRs: [0161](../decisions/0161-aeroplanes-wheels-level-runway-trim-flaps-readouts.md) (this plan)
- Read: ADRs 0019 (ground contact), 0035, 0042, 0045, 0049 (SAS), 0071, 0075; journal 041.
- Foundation (ADR 0097): the runway is a **Runway building** of a site (`defineBuilding`, plan 090), placed in the Space Center (plan 091); planes are rolled out to it from the Launch screen (plan 094, "Roll out to runway"). There is no runway "on the launch plain" any more.
- Read also: ADR 0097, 0102 (flaps, gear and trim as part actions and groups, plan 110), 0107 (read-outs in the refs HUD style, plan 088).

## Scope

**In (to be ordered at refinement):**
1. **Ground handling**: wheels (a stock part with rolling friction, steering and brakes) and a runway on the launch plain; today a vessel on the ground rests on boxes (ADR 0019), so a plane cannot roll.
2. **A flight-model review for planes**: trim (pitch trim input), flaps (a wing module with a deployable fraction), ground effect, wing-tip stall behaviour, a flat-plate pass at the sim's drag for fuselage parts (the per-part drag of boxes and cylinders double-counts a little at large angles, ADR 0035).
3. **Read-outs**: angle of attack, airspeed (indicated), glide ratio and a stall warning in the HUD; the stability read-out's rocket-shaped margin replaced by a static margin for a craft whose wings carry its weight.
4. **Controls**: roll and pitch as control-surface deflection with the keyboard (today the mixer drives them with the attitude demand), a "level wings" assist in SAS.
5. **Strut stiffness** is not needed: a vessel is one rigid body (ADR 0018); wing flex and breaking loads would be a separate decision.

**Out:** engines for aircraft (jets, propellers; thrust that depends on air), refuelling, runways on other bodies.

**Realignment (2026-10-17):** item 1's runway is the stock Runway building at the site (its flat footprint and the placement point come from plans 090 and 094). Flaps and landing gear are module actions with descriptors and groups (plan 110) so the vessel panel controls them. The angle-of-attack, airspeed and stall read-outs are panels in the dock (plan 112) or the navball module (plan 088). Aircraft designs carry a flag the Launch screen uses to offer the runway.

## Touches

- **Size:** L
- **Edits:** `packages/sim`, `mods/stock`, `packages/physics`, `apps/web/src/lib/hud`, `apps/web/src/routes/launch`, `packages/renderer/src/parts`
- **Shared contracts:** SDK (wheel module, flap action), design flag for aircraft (additive)

## Acceptance criteria

- [ ] `packages/sim` test: a wheeled craft on flat ground coasts down from 30 m/s at the rolling resistance's deceleration (`rolling × g`) within 15 %, holds its line with the side grip, and stops sooner with the brakes on.
- [ ] `packages/sim` test: the stock test plane on a flat runway lifts off at the speed where lift equals weight at its rotation angle of attack (hand calculation from the wing polar) within 10 %, after a take-off run within 20 % of `v² / 2a` with the measured mean acceleration.
- [ ] `packages/sim` test: a touchdown at 2 m/s sink on the wheels damages nothing; at 8 m/s it breaks a wheel.
- [ ] `packages/sim` test: with trim set and the `level` SAS mode, the plane in cruise holds altitude within 150 m for 60 s; flaps lower the stall speed.
- [ ] vitest: the read-outs (angle of attack, indicated airspeed, glide ratio, stall warning) from a stated snapshot; the Launch screen offers the runway for an aircraft design.

## Docs checklist

- [ ] STATUS, journal, ADRs, `simulation.md`, guide.

## Log

- 2026-10-17 — Created as draft by plan 041 (found, not done).
- 2026-10-17 — Realigned with the owner's Fondasi Orbital decisions (ADR 0097, 0102, 0107: runway is a building; flaps and gear are part actions).
- 2026-10-18 — Claimed by Agent 2 (Dev B, M2).
- 2026-10-18 — Refined with ADR 0161: wheels are frictionless colliders with sim-side tyre forces from the ground contacts; aircraft designs start level on the runway (nose north); trim command, flaps on the wing, `level` SAS mode, read-outs in the page.
- 2026-10-18 — Contract request: the SAS mode `level` (protocol `SAS_MODES`, additive) and, later, a heading on the surface placement for rotated runways. The `trim` command goes to the append-only command union.
