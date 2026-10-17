# 0120 — EVA: the suit is a vessel, two crew commands, walking and the jetpack as modules, a flag that stays

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [109](../plans/109-eva-crew-outside-the-vessel.md)
**Builds on:** ADR 0100 point 5 (EVA as a full actor), ADR 0176 (crew core), ADR 0181 (life support), ADR 0178 (science), ADR 0147 (milestones), ADR 0018, 0019, 0024 (compound bodies, ground, surface rails)

## Context

A crew member must leave a vessel, move on the ground or in space, plant a flag, take a surface sample and board again. The sim has vessels, a ground tile per vessel, modules with forces and actions, a crew roster whose members sit in parts, and a science core whose samples live in experiment module state. There is no walking controller, no translation input, no RCS and no way for a module to spawn a vessel or move crew.

## Decision

1. **The suit is a vessel of one stock part, `stock.eva-suit`** (90 kg with its pack, one seat, a command module so it counts as controlled and rests on surface rails like any lander). It carries a small life-support pack (ADR 0181: a member in a suit draws on the suit's stores), electric charge, a jetpack and a surface sampler. Saves, targets, the map and the Mission Center need no special case.
2. **Two crew commands:** `crew-eva { vessel, member }` spawns the suit 2 m beside the member's part (on the ground beside it when the vessel stands, in the same flight frame and velocity in flight; a vessel on rails is woken first) and moves the member into it. `crew-board { suit, vessel }` moves the member into a free seat of `vessel` within 50 m, moves the suit's held samples into the vessel's sample locker (`VesselState.samples`, credited at recovery with the rest of its science) and removes the suit as recovered, so no one is lost. Both refuse with a reason (not aboard, no free seat, too far, the suit in flight above the ground faster than 2 m/s relative to the vessel).
3. **Walking is a module, `stock.walk`:** its `walk { heading, speed }` and `stop` actions set a target ground speed; while landed, `update` applies a horizontal force toward it, bounded by the friction the ground gives (`μ m g`). Off the ground it does nothing.
4. **The jetpack is the stock engine on its own propellant** (`stock.eva-propellant`, 5 kg, 50 N, Isp 60 s): thrust along the suit's up axis by throttle, pointed with a small reaction wheel and SAS. Its Δv is the rocket equation's, which the engine descriptor already reports.
5. **The flag is a vessel of one part, `stock.flag`**, planted by the suit's `plant-flag` action through a sim request (like `detach`). A module may now declare `keep: true`: a vessel with such a module is never removed as resting debris (the 10 s rule), so a flag stays where it was planted.
6. **EVA in the records:** a new milestone kind `eva` (per body, the first time a member steps out there) and the crew place `eva:<body>` (XP 1, booked at recovery like the other places). Save schema: the milestone kind list grows (format 6 unchanged; an older build refuses a save with the new kind, as with any newer data).
7. **Renderer:** visual kinds `suit` (a procedural figure: torso, helmet, pack; no KSP likeness) and `flag` (pole and cloth).

## Consequences

- The flight HUD focuses one vessel with its design (ADR 0118 point 5). The suit has a one-part design built from its part, so the HUD can switch focus to it and back; a full vessel switcher remains a follow-up.
- Suit radios are plan 121; building by hand is out of scope.
