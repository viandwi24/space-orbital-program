# 380 — Realistic part stats in every system

**Plan:** [plans/380-realistic-parts-in-every-system.md](../plans/380-realistic-parts-in-every-system.md) · **Session:** realistic parts session (Claude) · **Date:** 2026-10-23 · **ADR:** 0317 · **API:** 0.1.116 · **Research:** [`realistic-part-stats.md`](../research/realistic-part-stats.md)

## What was done

- **Rules as data** (`mods/stock/src/parts/realism.ts`):
  - engine kinds with Isp and thrust-to-weight bands and targets;
  - tank dry fractions by size class, solid casing fractions;
  - a stage floor for integrated parts (tank plus engine);
  - a cost rule for liquid engines by thrust;
  - `realismIssues`, which names the part, the value, the band and the counterpart.
- **Every stock propulsion part follows the rules, by era** (the owner's follow-up through the roadmap session: the tech tree carries the progression):
  - the first tiers' parts are early-era: the LV-T30 250/215 s at TWR 80 (V-2 to LR-79), tanks about 21 % dry at 1.25 m, solids 230–250 s, the LV-909 an AJ10-104 at 280 s;
  - heavy-lift tiers are 1960s hardware (F-1, J-2, Merlin-class wide engine), and super-heavy tanks are modern (×0.85);
  - the 8-bell plate is hydrolox (RS-25);
  - heat shields carry journal 124's real-scale ablator in every system;
  - two new plates for a real-size Saturn V: five F-1 at 7.5 m and five J-2 at 5 m.
- **`mods/sol/src/balance.ts` is gone.** The variants patch bodies only. Sol's reference rockets are real two-stage stacks: a Falcon-like 1:1 orbiter and a 2.5 m kerolox first stage for rescaled.
- **The Δv the game shows comes from the world's bodies** (`apps/web/src/lib/worlds/system-facts.ts`):
  - the trip planner's ascent model, with stronger reference rockets when the 1.5 g one cannot climb the real Earth's air;
  - Create World's variant cards and its summary;
  - the Hangar, which now loads the world's system (`VabController.useWorld`) for the trip line, the checks' gravity and the Δv picker;
  - the first-flight guide's orbit line (`{air}`);
  - the lessons' numbers, from stock's bodies.
- **Blueprints list their systems** (`BlueprintDefinition.systems`, `blueprintFits`, `blueprintDesignFor`):
  - Kronos V has a real-size Saturn V design for Sol 1:1;
  - the station and the three satellites ride a Titan-like launcher there;
  - the Library builds the world's design and marks cards not designed for it.
- **`apps/web/src/lib/editor/blueprint-systems.test.ts`** flies every stock blueprint (and the lessons' Pathfinder) in stock, Sol rescaled and Sol 1:1, with the expected outcome per system.
- **System audit findings 4, 5, 11, 12, 25, 26, 27** (forwarded to this plan), fixed:
  - the Hangar now loads the world's system;
  - the trip planner works on the real Earth;
  - the Launch screen needs nothing more, since parts are the same everywhere;
  - blueprints per system;
  - two cost classes;
  - the "1 593 km across" text;
  - the Guidance ascent panel's default altitude.

- **Guidance's ascent burns on into orbit** (`mods/guidance/src/autopilots.ts`):
  - it caps the acceleration at 3 g;
  - a lofted climb coasts and then starts a closed-loop insertion half a burn before the apoapsis; a flat climb below the target goes straight into the insertion;
  - the insertion holds a time-to-go law to the target altitude and cuts within 5 km of it;
  - it replaced the node circularisation, during which a heavy stack could not turn (pointing error growing to 160°) and real-scale ascents fell back into the air and burnt up.
- **Tests on the new numbers:**
  - hand-written stock figures, the Sun-parity fixture (re-frozen) and the trajectory goldens;
  - the scripted test ascent and the sample script turn earlier and flatter (from 1 km, 83° by 30 km);
  - the sim's test vehicles that must fly far get later-tier tanks (the orbit lander, the moon rocket, Sol's transfer stage);
  - the fin and aeroplane tests get tail ballast to stay tail-heavy;
  - two resume checks use a 12 s window or a 1e-2 tolerance, with the measurements in their comments.

## Outcomes (headless, Guidance ascent to the system's low orbit; budget for the moon by the trip planner)

| Blueprint | Stock | Sol rescaled | Sol 1:1 |
|---|---|---|---|
| Two-stage starter | goal (75 km) | goal (50 km, just) | short |
| Booster rocket, Asparagus | goal | short | short |
| Moon shot | goal (Cinder orbit) | orbit only | short |
| Kronos V + Selene | goal | goal | goal (real-size Saturn V) |
| Wayfarer Shuttle | goal | short | short (draft plan 385) |
| Horizon Station, Moonwatch, Telescope, Aurora | goal | goal (real launcher) | goal (real launcher) |
| Lessons' Pathfinder | goal | goal (50 km, just) | short |

Eras in stock, flown: the early single stage (pod and LV-T30 on one to three small tanks, or a medium tank) falls back, at periapsis −190 to −420 km; the two-stage starter and a heavy-lift single stage both reach 75 km.

## What surprised me

- The trip planner's constant 1.5 g reference rocket cannot climb through the real Earth's 100 km of air at its drag figure: every turn angle falls back. It needs 2 g, which gives 8.76 km/s (real rockets: about 9.4).
- The Hangar always loaded the stock system, so a Sol world's Hangar showed stock's Δv target and gravity. With per-system part patches it also showed unpatched parts.
- Guidance's targeted landing is very sensitive to the lander's acceleration: 5 % more took the miss from under 3 km to 9.7 km. Forwarded to the rendezvous session.
- Headless flights are cheap (about 2 s each); the shared lock was the wait.
- The trip planner is pessimistic for real flights. On paper the early single stage was short of orbit, yet it flew there under Guidance, so the eras had to be tuned and tested by flight.
- Existing vessels in a save keep their module configs (the sim stores them per part), so a Sol 1:1 world's vessels built with the old balance patches keep their patched engines; new launches use the new stats.

## Verification output

Recorded in the plan's Log.

## Open questions

- A real-size Shuttle needs an external tank and boosters about four times stock's. The Wayfarer flies Sol 1:1 on its half-size stack; see the plan's Log for its outcome.
- Propellant density stays the game's (5 kg per unit for fuel and oxidizer alike): hydrolox stages are as compact as kerolox ones.
