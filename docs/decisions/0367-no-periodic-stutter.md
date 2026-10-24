# 0367 — No periodic stutter: warming on the loading screen, honest HUD, pacing, quiet saves

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/408-no-periodic-stutter-renderer.md
**Amends:** ADR 0308 point 4 and ADR 0310 (the background warm-up), ADR 0338 (pacing above 144 Hz, where Automatic may climb)

## Context

On Windows and the M2 the owner saw 140 to 180 fps with a freeze every few seconds, a 700 ms stall on a weaker machine, a blurry Space Center under a HUD that said "medium 100 %", and a stutter on Automatic that Low did not have. `refs/graphics-v2/06-periodic-spikes.md` ranked the causes; ADR 0359 had already removed the biggest rebuilds (the TAAU key, plan 400's light pool, the pipeline release).

## Decision

1. **Warming is part of loading, except on a boot load.** The other presets (and the governor's TAAU variants) are built on the loading screen: the world shows when the `presets` stage ends, unless the load boots on a cheap preset to show the world early (Windows first load, ADR 0308 point 8), which keeps the background warm-up. A round of warming in play is a freeze of 0.5 s or more on a slow machine, the TSL build of a planet variant being one synchronous task. The vegetation stage stays in idle slices of a few milliseconds.
2. **A page starts from the player's quality.** `acquire` resets the render scale, the planet scale, the TAAU override and the governed preset to what the player asked for: a drop to `low` in flight left the Space Center with TAAU off and the planet at half size.
3. **The HUD says what is drawn:** `Renderer.presetDrawn` (the preset drawn, with the requested one in brackets while they differ) and the TAAU share.
4. **Pacing.** The display rates the cadence estimate snaps to run to 240 Hz (165, 170, 175, 180, 200, 240 added): on a 165 or 180 Hz screen the governor snapped to 144 and skipped every second refresh.
5. **Saves.** The thumbnail is the canvas of the loop's next drawn frame, scaled by `createImageBitmap` in the task that drew it and encoded by `OffscreenCanvas.convertToBlob`: no extra frame, no synchronous canvas read-back and JPEG encode on the main thread; the old path is the fallback.
6. **Rebakes.** The cloud map moves one step at most every 8 s (was 2 s); the rocks' cell cache drops its oldest quarter at 60 000 cells instead of being cleared.
7. **The long-frame recorder** runs on every page (`perf/long-frames.ts`): a ring of the frames over twice the usual interval, tagged by what was marked near them (a compile, the warm-up phase, a governor step, an autosave) or a heap drop (a major GC). `__orbitalLongFrames()` in a development build; `scripts/measure-long-frames.ts` counts them per minute.
8. **Where Automatic climbs.** A device that starts on `low` and locks at 60 or less (a base M2, an integrated GPU) lets Automatic try `medium` at most, not `high`: the owner's M2 was stable on Low and stuttered on Automatic, whose failed trials at `high` each cost a rebuild; the player can still choose `high`.

## Consequences

- Loads on slow machines are longer by the warm-up's time (the M5's went from 41 s of background warming to 3 s on the loading screen after ADR 0359).
- A first load on Windows still warms in the background; its stalls are what the boot preset trades for an early world.
- Not done here: time-slicing the terrain patch bake (8 ms on the M5 at high, flight only), and the page-side allocation churn (plan 409).
