# 227 — Audio pack and minimal music

**Plan:** [plans/227-audio-pack.md](../plans/227-audio-pack.md) · **Session:** Worker D (MacBook Pro M2 13"), 2026-10-19 · **ADRs:** [0210](../decisions/0210-audio-additions-and-music.md) (proposed; found-while-building added), [0062](../decisions/0062-procedural-audio-web-audio-no-assets.md) (amended)

## What was done

| Where | What |
|---|---|
| `lib/audio/cues.ts` | The cue table: 13 cues (explosion, decouple, chute semi and full, touchdown, RCS, EVA step, jetpack, docking, map open and close, warp up and down), each with its bus, gain and visual sign; the music beds and `musicForPath` |
| `lib/audio/engine.ts` | The cues as procedural one-shots (filtered noise bursts, swept tones, the stage thunk); the music bus with four beds (detuned chords under a breathing low-pass) that crossfade over 2.5 s, and ducking under a warning |
| `lib/audio/director.ts` | `cue()` counts every cue and keeps at most 4 explosions within 1.6 s; a touchdown from the radar or from a reported impact (`touch()`), at most one a second; RCS puffs, EVA steps, the jetpack hiss |
| `lib/flight-loop.ts` | Stage → decouple; a destroyed part → explosion scaled by its mass; chute semi/full; docked → docking; map and warp cues; the touchdown toast; `data-audio-cues` for tests |
| settings, dialog, layout | `audio.music` (0.25 when absent, additive in format 4); the Music slider; the bed by page in the root layout |
| tests | `audio/cues.test.ts` (7), settings and params updated, `e2e/audio.e2e.ts` (2, Chromium) |

## What surprised me

- **A hard landing can slip between two radar readings.** The HUD model updates at 10 Hz, and a vessel falling at 60 m/s covers 6 m between readings, so it can be destroyed before a reading near the ground. The sim's `part-damaged` impact carries the speed, so it is a touchdown too, debounced with the radar's.
- **ADR 0062 disagrees with itself on the roar.** Its formula leaves a quarter of the roar in vacuum, while its own text, journal 053 and the tests keep only the rumble there. The code's `throttle × √p` stays, and ADR 0210 records why.
- **ADR 0210 and the plan differ on music.** The ADR's draft shipped an empty bus at 0.3; the plan asks for procedural beds at 0.25. The plan wins as the newer, owner-reviewed default. The ADR stays proposed until the owner picks the source.
- The cue counts work without unlocked audio (no user gesture in a test), because the director counts what it asks for.

## Verification output

```
cd apps/web && bunx vitest run src/lib/audio src/lib/eva src/lib/settings   53 passed (+1 touch test)
bun run lint                                                               OK
bun run check:affected                                                     ✓ prettier ✓ docs ✓ typecheck (web) ✓ web vitest 66/66
E2E_PORT=5261 bunx playwright test e2e/audio.e2e.ts --project=chromium    2 passed
Firefox: not run (worker brief: Chromium only on this machine)
```
