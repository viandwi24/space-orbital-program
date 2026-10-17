---
id: 063
title: "Aeroplane gameplay: landing gear, runway, trim, flaps, flight read-outs"
status: draft
owner: ""
depends: [041]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 063 — Aeroplane gameplay

## Goal

A player can build a winged craft, take off from a runway, fly it with the keyboard and land it. Plan 041 gave the parts and the physics (wings with lift, stall and induced drag; tilt for incidence; control surfaces on wings); this plan makes them a game.

## Context

- Found, not done, in plan 041 (reasons: a plane's gameplay is a plan of its own; 041 stopped at "a craft with wings glides at the glide ratio of its polar").
- Read: ADRs 0019 (ground contact), 0035, 0042, 0045, 0049 (SAS), 0071, 0075; journal 041.

## Scope

**In (to be ordered at refinement):**
1. **Ground handling**: wheels (a stock part with rolling friction, steering and brakes) and a runway on the launch plain; today a vessel on the ground rests on boxes (ADR 0019), so a plane cannot roll.
2. **A flight-model review for planes**: trim (pitch trim input), flaps (a wing module with a deployable fraction), ground effect, wing-tip stall behaviour, a flat-plate pass at the sim's drag for fuselage parts (the per-part drag of boxes and cylinders double-counts a little at large angles, ADR 0035).
3. **Read-outs**: angle of attack, airspeed (indicated), glide ratio and a stall warning in the HUD; the stability read-out's rocket-shaped margin replaced by a static margin for a craft whose wings carry its weight.
4. **Controls**: roll and pitch as control-surface deflection with the keyboard (today the mixer drives them with the attitude demand), a "level wings" assist in SAS.
5. **Strut stiffness** is not needed: a vessel is one rigid body (ADR 0018); wing flex and breaking loads would be a separate decision.

**Out:** engines for aircraft (jets, propellers; thrust that depends on air), refuelling, runways on other bodies.

## Acceptance criteria

- [ ] To be made measurable at refinement (take-off distance and rotation speed of a stated craft against a hand calculation; a landing at a stated sink rate without damage; a trimmed cruise that holds altitude within a stated bound for 60 s).

## Docs checklist

- [ ] STATUS, journal, ADRs, `simulation.md`, guide.

## Log

- 2026-10-17 — Created as draft by plan 041 (found, not done).
