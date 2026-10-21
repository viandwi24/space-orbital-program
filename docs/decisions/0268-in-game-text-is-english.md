# 0268 — In-game text is English; part nicknames are English words

**Status:** accepted (owner, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/305-english-in-game-text.md
**Amends:** ADR 0255 point 1 (the nicknames it listed were Indonesian words)

## Context

ADR 0255 named stock parts `OrbitX <code> "<nickname>"`, and the parts of plans 277–303 took Indonesian nicknames ("Kuncup", "Tong", "Lonceng"). The mission blueprints also had Indonesian names ("Ulang-Alik", "Stasiun Cakrawala"). The owner: the game is global, so every in-game string must be English.

## Decision

1. Every player-facing string of the game and of the stock mod is English. This covers part titles and nicknames, blueprint names and texts, tech-tree labels, missions, contracts, the UI.
2. Nicknames are English words: for example "Bud" (was "Kuncup"), "Barrel" (was "Tong"), "Bell" (was "Lonceng").
3. Fictional names that read naturally in English stay, for example Kronos and Selene. The blueprints are Kronos V + Selene, Wayfarer Shuttle, Horizon Station, Moonwatch Orbiter, Horizon Telescope and Aurora Research Satellite.
4. Tests guard the rule:
   - `mods/stock/test/english.test.ts` scans every registered definition's strings for common Indonesian words.
   - The blueprint test checks the blueprints' names and texts.
5. Docs written for the owner (`refs/`, some journal notes) may stay in Indonesian; they are not in the game.

## Consequences

- Part ids did not change, so designs and saves are unaffected.
- The research tracker's nickname column is historical; the parts carry the English names.
