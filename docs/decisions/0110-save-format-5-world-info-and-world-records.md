# 0110 — Save format 5: the world info travels beside the ECS world; world records own saves

**Status:** accepted
**Date:** 2026-10-17
**Plan:** [077](../plans/077-world-container-and-save-format-5.md)
**Builds on:** ADR 0050 (save format, migration policy), ADR 0094 (worlds are saves), ADR 0095 (gravity model), ADR 0103 (epoch)

## Context

ADR 0094 makes a world the container of a game and puts everything the sim needs into the sim's state, and ADR 0050 point 6 says how a save format changes. Plan 077 lands the first world fields (id, seed, system id, system version, scale variant, gravity model, epoch, rules, sites) and the web client's world records. Three choices were open: where the world fields live inside the sim, which id a migrated save gets, and where the web client keeps world records.

## Decision

1. **`WorldInfo` is a singleton held by the sim core, saved as the top-level `SimSave.worldInfo`**, not a component on an entity of the ECS world. A singleton entity would shift every vessel and part entity id by one in new runs, which old saves, tests and the HUD's focus id rely on, and the ECS `WorldData` format would not change for it. The sim reads it as `Sim.worldInfo` (a frozen copy); systems that need it later (rules, plan 078) get it through their context, not through a query.
2. **Fields** (core `WorldInfo`, `worldInfoSchema`): `id` (string), `seed` (finite number), `systemId` and `systemVersion` (the plugin whose bodies the world uses and its version), `variant` (scale variant, `"default"` for the stock system), `gravityModel` (`"patched"`; `"n-body"` is refused with "n-body worlds are not available yet", ADR 0095), `epoch` (`{ day, fraction }`, the instant of `t = 0`, fictional day 0 by default, ADR 0103), `rules` (a map of rule id to boolean, number or string, empty until plan 078), `sites` (objects with an `id`, empty until plan 084).
3. **Format 5, migration 4 → 5** gives a save the **Legacy world**: id `"legacy"`, the save's own `seed`, system `stock` at the version of the stock plugin listed in the save (or `0.0.0` when absent), variant `default`, `patched`, epoch day 0 fraction 0, no rules, no sites. The migration is pure, so the id is a constant; new worlds get random UUIDs from the host (ADR 0094 point 5), never from the sim PRNG. `createSim` without `world` and without `resume` starts the same Legacy world, so tests and the existing flight page keep working unchanged.
4. **Web client:** the envelope `orbital-game-save` moves to version 2 with `worldId` (a version 1 envelope reads as `worldId: null`, unassigned). World records `{ format: "orbital-world", formatVersion: 1, id, name, createdAt, lastPlayedAt, preset, mods, changelog, summary }` live behind a `WorldStore` interface; the IndexedDB adapter keeps them in a `worlds` object store **in the existing database `orbital-saves`** (version 2), not in a database `orbital` as ADR 0050 point 9 and ADR 0094 point 2 name it: saves already live in `orbital-saves`, and one database lets a later plan move a save and its world in one transaction.
5. **Client migration** (`migrateLegacySaves`): every stored save without a `worldId` is attached to the world record with id `"legacy"` (name "Legacy world", preset `sandbox`), which it creates once. Running it again changes nothing. The record id equals the migrated sim's `worldInfo.id`, so both layers name the same world.

## Alternatives considered

- **A singleton ECS entity** (`sim.world-info` component) — rejected (point 1): it renumbers entities and puts identity data where every system can overwrite it.
- **A random id for migrated worlds** — rejected: a migration must be pure (ADR 0050 point 6), and two reads of the same old file would otherwise produce two different worlds.
- **A separate `orbital` database for worlds** — rejected (point 4).

## Consequences

- Plans 078, 081, 084, 085 and later fill `rules`, `epoch` and `sites`; adding a field with a default is additive (no bump) when old readers can ignore it, otherwise it is format 6 with its own migration, numbered through the Lead (roadmap §3.6).
- The frozen fixture `packages/sim/test/fixtures/save-v4.json` stays; the `formatVersion` 4 test now asserts the migration to 5.
- `API_VERSION` 0.1.25 (additive core types).
