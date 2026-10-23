# 0317 — Realistic part stats in every system; difficulty comes from the system

**Status:** accepted
**Date:** 2026-10-23
**Plan:** plans/380-realistic-parts-in-every-system.md
**Builds on:** ADR 0184 point 5 (variants and balance patches; this ADR replaces the balance-patch part of it), ADR 0113 (costs by rule), ADR 0083 (the trip planner's ascent model), ADR 0256 (size classes)
**Supersedes:** ADR 0184 point 5's "balance patches on stock parts"

## Context

Stock parts had toy-scale numbers, tuned for the small stock system: KSP-like engines (thrust-to-weight about 17) and tanks with a dry mass of one ninth of the propellant. To make Sol flyable, `mods/sol/src/balance.ts` patched parts for each Sol variant. The 1:1 patch turned the LV-T30 into a 1.2 MN hydrolox-like engine and made two tanks 40 % lighter. Those patches touched 4 of about 200 parts. In a Sol world every other part was still toy-scale, and a part looked different in the Hangar depending on the system. The Hangar also always loaded the stock system, so its Δv target was stock's in every world.

The owner decided on 2026-10-23: "part dengan angka realistis tanpa patch per sistem, kesulitan ditentukan sistem" (parts with realistic numbers, no per-system patches, the system sets the difficulty).

## Decision

1. **One set of stats per part, in every system.** A part's mass, thrust, Isp and capacity are the same in stock, Sol rescaled and Sol 1:1. No mod patches parts per system. A system variant may still patch **bodies** (the rescaled variant's geometry).
2. **Stats are realistic, by rule.** `mods/stock/src/parts/realism.ts` holds the rules as data, taken from real hardware (`docs/research/realistic-part-stats.md`):
   - **Engine kinds.** Sea-level kerolox, vacuum kerolox, sea-level hydrolox, vacuum hydrolox, hypergolic, solid, escape solid, monopropellant and cold gas. Each kind has a reference band for vacuum and sea-level Isp, and for thrust-to-weight (vacuum thrust over dry mass × g0). It also has a target thrust-to-weight inside that band.
   - **A liquid engine's dry mass is its thrust over (g0 × target TWR).** A clustered plate adds 15 % for its thrust structure. Extremes are capped: the Merlin's 184 is a real outlier, and the sea-level kerolox target is 85 (F-1 94, RD-180 78, RD-107A 87).
   - **A tank's dry mass follows a dry fraction for its size class,** from 12 % at 0.625 m down to 4.5 % at 7.5 m (Centaur III about 10 %, S-IVB 11 %, S-II 7.5 %, S-IC 6.2 %, the Shuttle's external tank 3.5 %).
   - **A solid motor's casing follows a dry fraction by size,** within 8–20 % (Shuttle SRB 15 %).
   - **Integrated parts are checked as stages.** These carry their own propellant and structure: the landers, the orbiter's aft section, the liquid booster and the escape tower. Their Isp is checked, and their stage dry fraction must fall in a stage band.
   - **The tech tree carries the era** (owner's follow-up, 2026-10-23). The first tiers' parts are realistic for the 1940s and 50s:
     - early kerolox like the V-2 to the LR-79 (Isp 250/215 s, TWR 80);
     - early storables (280 s) and early solids (230–250 s);
     - steel and aluminium tanks at ×2.3 their size class's fraction (about 21 % at 1.25 m).

     The heavy-lift tiers are 1960s hardware (F-1, J-2, AJ10, Merlin-class), and the super-heavy tier is modern (composite tanks at ×0.85). In stock, a start-of-career rocket needs two stages to reach orbit, and a later-tier one does it on one. Flown on Guidance in `apps/web/src/lib/editor/eras.test.ts`.
   - **Everything else is checked once against its counterpart and kept.** That covers pods, structure, science parts and power. The research note lists the counterparts.
3. **What is not made realistic.** Propellant density stays the game's (5 kg per unit of fuel or oxidizer, one resource pair for every liquid engine). An engine's kind sets its Isp, not which resource it burns. Thrust stays what each part had. The 8-bell plate becomes hydrolox (RS-25 class), because it serves as Kronos V's third stage and the Shuttle's main engines. Two plates are new, for a Saturn V the real size: five F-1s at 7.5 m (38.85 MN) and five J-2s at 5 m (5.17 MN).
4. **Costs stay by rule.** Tanks, structure, solids and integrated parts keep ADR 0113's dry-mass rule. Liquid engines become much lighter, so their cost follows thrust instead: `7 500 × (kN / 215)^0.7 × kind factor` (kerolox 1, hydrolox 1.2, hypergolic 1.3). The LV-T30 stays at 7 500, and the large plates come out within about 15 % of their old prices.
5. **A test guards the rules.** `mods/stock/test/realism.test.ts` checks every registered stock part that has an engine, a tank or a solid. Each engine's Isp and TWR must be in its kind's band, each tank's dry fraction in its band, and each part must have a kind. A part outside the bands fails with its id, the value, the band and the counterpart. A synthetic out-of-band part proves that the message is produced.
6. **Difficulty is the system's.** Create World labels each system from its own Δv to orbit: Easy · learning under 4.5 km/s, Medium under 7.5 km/s, Realistic above. Stock (600 km home, about 3.4 km/s to orbit) is easy, and realistic parts are overkill there. Sol rescaled (about 5 km/s) is medium. Sol 1:1 (about 9.4 km/s) needs real staging. The Δv figures every screen shows come from the world's bodies (the trip planner's ascent model, ADR 0083), not from constants. This covers the Hangar's trip line and pre-flight checks, Create World's facts, and the lessons' hints. The Hangar loads the world's system.
7. **Blueprints say which systems they are for (API 0.1.116).** A blueprint lists the systems it is designed for, and may carry a design per system (a Kronos V for Sol 1:1 sized like the real Saturn V). Headless flight tests fly every stock blueprint in every listed system, and record the expected outcome for each system.

## Consequences

- Stock rockets become stronger: a small stock rocket gains about 15–20 % Δv, because its engine is a quarter of the old mass. Stock is meant to be easy; the old balance does not need preserving.
- The Guidance ascent panel's default altitude follows its autopilot's rule: 80 km, or 10 km over a taller atmosphere.
- **Saves keep loading,** and nothing per-system is left in a design. A design names part ids only, and a saved world's parts resolve by id.
  - A vessel that already exists in a save keeps the module configs it was built with: the sim copies each part's module configs into the world when the vessel is created, and saves them. That includes a Sol 1:1 world's patched 1.2 MN LV-T30.
  - Dry masses come from the definitions at load, so they change.
  - Every launch after this uses the new stats.
  - No migration rewrites hardware already in flight.
- `sol.balance-*` patch ids disappear. The developer viewers and the loader log no longer list them.
- Mod authors get one rule: use realistic stats and never patch parts per system. The mod guide says so.
