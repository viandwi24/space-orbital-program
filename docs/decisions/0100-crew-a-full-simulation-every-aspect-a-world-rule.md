# 0100 — Crew: a full simulation, every aspect a world rule, Sandbox as free as possible

**Status:** accepted (point 3 Career preset amended by ADR 0109)
**Date:** 2026-10-17
**Plan:** none (owner decision "crew-depth", 2026-10-17); delivered by plans 106 to 109, 121
**Builds on:** ADR 0094 (rules), 0096 (background operations), 0098 (no locked tools).
**Research:** `refs/reverse-engineering-ksp2/08-crew.md`, `refs/space-orbital-program-ui/docs/SCREENS.md` (Astronaut Complex), `CONCEPT.md` §4 (crew panel).

## Context

Orbital pods are uncrewed. Crew only matter if they change outcomes; KSP2's interchangeable crew were felt as a step back. The research recommended three professions with traits as data, XP that improves abilities, deterministic personality effects and death as a world rule. **The owner chose a full simulation from the start (life support, morale, rest)**, and added: "as simulated as possible, but still adjustable or custom, and Sandbox as free as possible".

## Decision

1. **Crew per world.** A roster of crew members with a profession (pilot, engineer, scientist; tourists as passengers), traits as data (`defineCrewTrait`: courage, stupidity and others with deterministic effects), XP earned from new places × difficulty and booked on a safe return, salary and recruit cost (economy, ADR 0098), and a flight log per world.
2. **Abilities change quality, never unlock tools** (ADR 0098 point 3): a pilot gives finer control and a larger script budget, an engineer repairs and improves reliability, a scientist improves data quality; courage and stupidity change g tolerance and panic during blackout deterministically.
3. **Full simulation**, each aspect a separate world rule with levels:
   - life support (oxygen, water, food, CO2 scrubbing as resources on parts): `off` / `simple` (one consumable) / `full`;
   - morale (mission length, crowding, events): `off` / `on`;
   - rest and fatigue (work hours, sleep, performance): `off` / `on`;
   - g-load and radiation exposure: `off` / `on`;
   - death: `permanent` / `return after N days` / `off`.
   Presets: **Sandbox** all off (crew exist, are immortal, no salaries); **Science** life support `simple`, the rest off; **Career** everything `full` or `on` (the owner's choice), and every value can be changed in Create World and mid-game (ADR 0094 point 4). A "custom" preset is any mix.
4. **Background.** Crew on unloaded vessels consume and rest by the closed forms of ADR 0096; running out is predicted and shown ("oxygen for 3 d 4 h") before it happens.
5. **EVA** is a full actor (a small vessel with a suit and a radio, ADR 0101 tier 6), delivered after the crew core.

## Alternatives considered

- **Three professions + traits, life support only as a rule** (research recommendation) — not chosen as the default depth; the owner wants the simulation complete. Its parts are the core of plan 106, so a lighter game is a preset away.
- **Crew as seat fillers** (KSP2) — rejected.
- **Skills that unlock SAS modes** (KSP1) — rejected by ADR 0098 point 3.

## Consequences

- **Mod API:** `defineCrewTrait`, crew capacity and life-support consumption in part and module data, consumables as resources (additive, patchable).
- **Save format:** roster, seats, consumables, morale and fatigue state are world and vessel components (bumps with migrations in plans 106 and 107).
- **Protocol:** commands to assign seats at launch and move crew between parts; crew in the snapshot of the focused vessel.
- **Performance:** crew state updates at 1 Hz of sim time in flight and on the world tick otherwise.
- **UI:** the Astronaut Complex screen and the crew panel (EVA/IVA suit chip and radio bars) of the refs; the refs' sample crew names are KSP characters and are never used.
- Follow-ups: plans 106 (core), 107 (simulation), 108 (screens), 109 (EVA), 121 (suit radios).
