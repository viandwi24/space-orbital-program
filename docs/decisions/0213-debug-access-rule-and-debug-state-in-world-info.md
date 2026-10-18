# 0213 — Debug access is a world rule; debug state lives in the world info

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/203-debug-panel-and-cheats.md
**Builds on:** ADR 0200 (debug panel and API), ADR 0111 (world rules and presets), ADR 0110 (world info in the save)

## Context

ADR 0200 point 8 fixes who may use the debug tools: Sandbox always, other modes after the player turns on Debug mode, Career Hardcore never. It does not say how the sim, which knows no preset by name, tells these worlds apart, nor where the cheat switches and the "used cheats" mark are kept so that a save carries them.

## Decision

1. **Access is a stock rule,** `stock.debug-tools`, an enum of `always`, `opt-in` and `locked`. Its presets are Sandbox `always`, Science and Career `opt-in`, Career Hardcore `locked` (default per owner review, rancangan §15 #14; may change). It is not changeable during play (`changeable: false`), so a world cannot unlock itself. A world without the rule (no stock mod) counts as `always`.
2. **Debug state is part of `WorldInfo`:** an optional `debug` object with `mode` (Debug mode is on in this world), `usedCheats` and the list of cheats that are on. It is additive and optional, so saves keep format 8 and an older save reads as "never used".
3. **Every debug change is a sim command** (`debug-mode`, `debug-cheat`, `debug-grant`, `debug-set-orbit`, `debug-set-location`, `debug-set-resource`, `debug-set-temperature`, `debug-set-crew-level`). The sim refuses one with a reason when the rule is `locked`, or `opt-in` with Debug mode off.
4. **`usedCheats` is set for good** by turning Debug mode on and by any accepted debug command, in every mode, Sandbox included. Achievements read it: none unlocks in a world that has it.
5. **Debug mode in Settings is a player switch,** not a world value. With it on, the flight turns Debug mode on in an `opt-in` world (one `debug-mode` command), and the Worlds record of that world is marked "used cheats".

## Alternatives considered

- **The sim reads the preset id** (`stock.career-hardcore`) — rejected: a mod's own presets could not say where they stand, and the sim would name stock content.
- **Cheats as host flags outside the sim** — rejected by ADR 0200 point 2: they would not save or replay.
- **A separate `SimSave.debug` section** — rejected: the world card reads the world info already, and the mark belongs to the world, not to one run.

## Consequences

- Create World lists "Debug tools" with the other rules; a custom world can pick its value at creation, and the world is then marked custom as usual.
- Plans after 203 set up test states with the debug commands in a Sandbox world without extra steps.
