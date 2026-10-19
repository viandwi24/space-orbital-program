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

## Found while building (plan 227)

- **The music source.** Plan 227 ships four procedural beds as the default source: menu, Space Center, Hangar and space. Each is a slow detuned chord under a breathing low-pass, so ADR 0062's no-assets rule holds. The Music slider defaults to **0.25**, the plan's figure (point 3 above said 0.3). CC-licensed tracks would replace only the bed source in `lib/audio/engine.ts`. This ADR stays proposed until the owner picks the source.
- **The roar curve.** It stays `throttle × √pressure` (`params.ts`). ADR 0062's written `throttle × (0.25 + 0.75 p)` leaves a quarter of the roar in vacuum, against ADR 0062's own sentence that only the rumble remains there, and against journal 053's measurement and the tests built on it.
- **Visual signs.** They are the existing toasts and chips (cue table, `lib/audio/cues.ts`). The touchdown is the one event without a sign of its own, so it gets a toast with its speed. No screen flash was needed, so nothing flashes and reduced motion has nothing to turn off.
- **Explosions.** At most 4 sound within 1.6 s, so a breakup does not clip.
- **Ducking.** Music ducks to 35 % for 1.5 s under a warning.

## Alternatives considered

- **Keep no music** (ADR 0062) — possible; the slider then stays hidden.
- **Adaptive music** — rejected for now (rancangan §11.9, P2).

## Consequences

- Plan 227 delivers points 1, 2 and 5 now and point 3 after the owner picks a source; this ADR moves to accepted then.
- ADR 0062's settings gain a fourth volume.
- A CC source would add assets, a licence list and a CSP check for media.
