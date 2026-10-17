# 0094 — Worlds are saves; modes are presets over per-world rules; offline-first and generic

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decisions "Fondasi Orbital", 2026-10-17); delivered by plans 077, 078, 087
**Builds on:** ADR 0010 (state in the world), 0041 (vessel library), 0050 (save format), 0057 (mods and trust).
**Research:** `refs/reverse-engineering-ksp2/01-game-structure-and-modes.md`, `refs/space-orbital-program-ui/docs/CONCEPT.md` §2 (git-ignored; summarised here).

## Context

Orbital 1.0 has saves (quick, auto, named) of one flight, and no idea of a game that lasts: no mode, no rules, no progress, no place that owns crew, sites or a network. Every system the owner decided on 2026-10-17 (economy, science, crew, comms, sites, agencies) needs a container that says which systems are on and with which settings. Kerbal Space Program 1 used three fixed modes chosen at creation; a wrong setting meant starting over. The owner chose presets over rules, and a fully client-side game with no backend for now, designed so that one can be added later.

## Decision

1. **A world is a save container.** A world holds its preset, its rules, its star system (id, version, scale variant), its seed, its epoch (ADR 0103), its gravity model (ADR 0095), its sites (ADR 0097), its progress (currencies, tech, contracts, milestones), its crew, its vessels and its network. Mods and the vessel library stay **global** (shared by every world); a world remembers the mods it was created with and warns on its card when one is missing ("Uses a mod that is no longer installed"). Crew belong to one world.
2. **Two layers of storage.** Everything the sim needs to run (rules, epoch, sites, ledgers, crew, contracts, science, network) is state in the sim's world (ADR 0010) and travels in `SimSave`; the web client's world record (`format: "orbital-world"`, in the IndexedDB database `orbital`, store `worlds`) holds the metadata a list needs (name, preset label, created and last played, summary, thumbnail, mods at creation, the rule changelog) and owns its saves (the save envelope of ADR 0050 point 9 gains `worldId`). Autosaves are a ring per world; named saves are snapshots of the world.
3. **Modes are presets.** Sandbox, Science and Career are named sets of rule values, not code paths. A **rule** is a typed registry entry (`defineRule`: id, value type boolean / enum / number with bounds, default, value per preset, category, whether it may change after creation). Stock rules include: economy on/off and multipliers, science depth (`classic` default, `discovery` optional, ADR 0099), tech tree on/off, crew death and every crew-simulation aspect (ADR 0100), signal delay and control without signal (ADR 0101), range safety (ADR 0097), part reliability (**off by default**, on in an "engineer" preset or by choice), agency type (`government` / `company` / `hybrid`, chosen at creation), comms scale. Mods add rules and presets the same way (ADR 0104).
4. **Rules change mid-game.** A rule marked changeable is changed by a validated command (`set-rule`), applied at a step boundary and appended to the world's **rule changelog** (game time, rule, old and new value), shown in the world's details. Identity rules cannot change after creation because the world would stop being the same world: star system and its scale variant, gravity model, seed, primary site location. Changing those means a new world (Duplicate offers it).
5. **Offline-first, generic.** No backend, no network call in the core loop (spec non-goal unchanged). To keep a later backend possible without rework: world, save and challenge records are self-describing versioned JSON with stable random ids; storage stays behind interfaces (`SaveStore`, a new `WorldStore`); nothing in the sim reads a wall clock (the host reads it once, ADR 0103); results that could be verified elsewhere (achievements, challenges, ADR 0098) are recomputable from a save plus a command log.
6. **Old saves** migrate into one world named "Legacy world" with the Sandbox preset, the stock system, a fictional epoch at day 0 and the launch site of ADR 0030 as its first site (ADR 0097), so 1.0 saves keep loading.

## Alternatives considered

- **Fixed modes** (KSP1) — rejected by the owner: a wrong choice cannot be fixed and mods cannot add a mode.
- **Global progress across worlds** — rejected: crew, money and sites only mean something inside one world.
- **World state outside the sim (page-side only)** — rejected: rules change sim behaviour (crew death, signal, reliability), and ADR 0010 keeps state in the world so saves and determinism hold.

## Consequences

- **Save format:** `SimSave` format 5 (from 4) gains required world fields (rules, epoch, gravity model, sites); migration 4 to 5 fills the Legacy-world defaults and a frozen `save-v4.json` fixture is kept (ADR 0050 point 6). The game-save envelope gains `worldId`; the web client migrates existing records once.
- **Protocol:** a `set-rule` command and a `world:rule-changed` event; the snapshot carries the rule values the HUD needs.
- **Mod API:** `defineRule` and `definePreset` (additive, minor bump of `API_VERSION` 0.1.x).
- **Performance (ADR 0053):** rules are read at boot and on change; no per-step cost.
- **UI:** the Worlds screen and the Create World dialog (refs `Worlds.dc.html`) replace the save list as the entry point (plan 087); the main menu's Continue enters the last world.
- Follow-ups: plans 077 (container, format 5), 078 (rules, presets, changelog), 087 (screens). Scenarios as world templates and tutorials as script mods are later work, not planned here.
