# 077 — World container: worlds own saves, save format 5

**Plan:** plans/077-world-container-and-save-format-5.md · **Session:** Agent 1 (Lead, MacBook Pro M5), 2026-10-17 · **ADRs:** [0110](../decisions/0110-save-format-5-world-info-and-world-records.md) (new), [0094](../decisions/0094-worlds-are-saves-modes-are-presets-over-rules.md), [0050](../decisions/0050-save-format-and-resume.md) · **Research:** `stack-versions.md` (fake-indexeddb)

**Status when written: criteria met** (verification output below).

## What was done

| Where | What |
|---|---|
| `packages/core/src/world.ts`, `schemas.ts` | `WorldInfo`, `GravityModel`, `LEGACY_WORLD_ID`, `legacyWorldInfo`, `worldInfoSchema` (n-body refused with its reason) |
| `packages/core/src/save.ts`, `version.ts` | `SIM_SAVE_VERSION` 5, `SimSave.worldInfo`, migration 4 → 5 (Legacy world), an `incompatible` refusal for n-body, re-signing over the schema-ordered data; `API_VERSION` 0.1.25 |
| `packages/sim/src/sim.ts`, `core.ts`, `save.ts` | `createSim({ world })` (validated; Legacy by default; must match the save's on resume), `SimCore.info`, `Sim.worldInfo` (frozen), written by `writeSave` |
| `packages/*/test` | core: v4 fixture → Legacy world, n-body, damaged world info; sim: format 4 fixture now reads as 5, world option saved/resumed/refused, a byte-exact resume of a world run through rails, warp and a burn in free space |
| `apps/web/src/lib/save` | envelope version 2 with `worldId` (from `sim.worldInfo.id`; version 1 reads as `null`), `world-record.ts` (`orbital-world` records), `world-store.ts` (`WorldStore`, memory), `store-idb.ts` (database version 2, `worlds` store, one shared connection, `onversionchange`), `migrate-worlds.ts` (Legacy world, idempotent), run from `openSaveStore`; vitest on `fake-indexeddb` |

## Measured save size

The frozen format 4 fixture (two probes, 8 entities) is 4,486 bytes as compact JSON; migrated to format 5 it is 4,665 bytes: **+179 bytes (+4.0 %)**, all of it `worldInfo`. The addition is constant per save (it grows only with rules and sites in later plans), so a typical flight save of tens of kilobytes grows well under 1 %.

## What surprised me

- **A migrated save did not pass its own second read.** `readSimSave` re-signed the migrated object, then zod's object parse returned the keys in schema order (`worldInfo` before `world`), so the bytes the checksum covered were not the bytes returned. Earlier migrations got away with it because their tests never read a migrated save twice; the web client does exactly that (`parseGameSave`, then `createSim`). The signature is now computed over the parsed data.
- `ADR 0050` and `ADR 0094` name the database `orbital`; the saves have always lived in `orbital-saves`. Worlds went into the existing database (ADR 0110 point 4) so a later plan can write a save and its world in one transaction.
- The world info is not an ECS entity: a singleton entity would have renumbered every vessel in new runs (ADR 0110 point 1).

## Not met / not done

- No screen shows worlds yet (plan 087). `lastPlayedAt` and the summary are written at migration only; 087 keeps them current.
- `rules` and `sites` are empty placeholders (078, 084); `epoch` has no maths (081).
- The Legacy world has no site: ADR 0094 point 6 names the ADR 0030 launch site as its first site, which plan 084 adds with the site model.

## Verification output

See the plan's Log for the commands and their output lines.
