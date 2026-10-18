# 0210 — Audio additions and music

**Status:** proposed
**Date:** 2026-10-18
**Plan:** plans/227-audio-pack.md
**Amends:** ADR 0062 point 1 ("There is no music in 1.x"; settings have master, effects and interface volumes)

## Context

Audio is procedural Web Audio with no files (ADR 0062). Continuous layers are engine roar, rumble and wind; one-shots are SAS on/off, stage and a warning tone (`director.ts:21,39-60`, `flight-loop.ts:564,802,823`; research doc 15b). The engine roar code uses `throttle × √pressure` (`params.ts:80-81`) where ADR 0062 says `throttle*(0.25+0.75*p)`. The new parts and actions (chutes, RCS, decouple, docking, EVA, jetpack) have no sound. ADR 0062 decided "no music". The owner left music open. Rancangan §11.4, §11.5 and §11.8.

## Decision

1. **New effect sounds,** procedural in ADR 0062's style: explosion, decouple, parachute deploy, touchdown, RCS puffs, EVA steps, jetpack, and UI cues for map and warp.
2. **Every audio cue has a visual mirror** (a flash, an icon or a toast), and camera shake and flashes respect reduced motion.
3. **Proposed: a minimal music set.** Menu, Space Center, Hangar and space ambient, quiet by default, behind a new **Music** volume (default 0.3 of master) (default per owner review, rancangan §15 #9; may change).
4. **The source is the owner's call** (rancangan §15 #9): procedural in code, which keeps ADR 0062's no-assets rule, or CC-licensed recordings, which need a licence record per file and an asset path. Until the owner decides, plan 227 ships points 1–2 and the Music slider wired to an empty bus.
5. **The roar formula is reconciled** to one documented curve in the plan's journal.

## Alternatives considered

- **Keep no music** (ADR 0062) — possible; the slider then stays hidden.
- **Adaptive music** — rejected for now (rancangan §11.9, P2).

## Consequences

- Plan 227 delivers points 1, 2 and 5 now and point 3 after the owner picks a source; this ADR moves to accepted then.
- ADR 0062's settings gain a fourth volume.
- A CC source would add assets, a licence list and a CSP check for media.
