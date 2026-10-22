# 362 — Automatic quality that matches a fixed preset

**Plan:** [plans/362-auto-quality-fix.md](../plans/362-auto-quality-fix.md) · **ADR:** [0304](../decisions/0304-auto-quality-steps-presets-on-webgpu.md) · **Session:** perf / auto quality (Claude) · **Date:** 2026-10-22

## What was done

- **Governor** (`packages/renderer/src/quality-governor.ts`):
  - `PRESET_FLOOR_SCALE` (0.85): only the last preset goes below it.
  - `startAt`.
  - `setFrameCap`, `paceFps`: the limit paces with the governor off too.
  - `calibrateWork`: the work time is scaled by what the interval showed at each drop.
  - The steady-judder rule (10 % over across 5 s): a resolution step that did not help jumps to the next preset; a preset step that did not help holds.
- **WebGPU** (`renderer-webgpu.ts`):
  - `governorPresetSteps: true`.
  - `RendererConfig.warmPresets`: the named presets are drawn at load with their part models in view (`withParts`).
  - `info().presetWarmMs` and `renderScale`.
  - The GPU meter divides the pool by the frames it holds.
- **Web**:
  - `graphics.ts`: learned level per backend; `startPreset`, `governorCeiling`, `warmPresetsFor`, `graphicsStart`; the frame-rate limit.
  - `flight-loop.ts`: `governorPlan`/`startGovernor` on every Flight visit; the learned level is saved at each governor move under Automatic; `setFrameCap`.
  - Settings → Graphics: "Frame rate limit" (Display / 60 / 30). The Quality and Adjust texts now say what they do.
  - `__orbital.governor()` for the scripts.
- **Tool**: `apps/web/scripts/measure-auto-quality.ts`. It reports frame intervals, the governor's history, GPU ms and load time; `STEPS=1` adds the longest frame after a scale or preset switch.

## Why the owner saw 25 fps

The M5 resolves Automatic to `high`, and on WebGPU the governor could only lower `high`'s resolution. On Retina the pixel budget removes the half-planet rungs, so the ladder was `high` 100 % → 85 % → 55 %. Then, still slow at the floor, it locked the target to 30 fps.

`high`'s cost in orbit is mostly not its pixels:
- the shadow map over a 30-part vessel;
- part detail;
- MSAA;
- the frame end at 5.7 Mpx, which the timestamps do not see.

So no scale helped, and the lock read as about 25 on the owner's screen.

The same spiral reproduced on the M2: `high` with adjust at 39 fps, `high 85 % — locked to 30 fps: 60 is out of reach at the lowest rung` (run `ab-before-1`).

## Numbers (M2, 60 Hz, AC; Kronos V + Selene in a 100 km orbit; 60 s traces after 15 s)

| Configuration | before | after |
|---|---|---|
| WebGPU, Medium, adjust off | 60.0 fps (one run 47 under load) | 60.0 fps |
| WebGPU, High, adjust on (the owner's Automatic on an M5) | 39.0 fps, locked to 30 at high 85 % (run 1); 53–55 fps with 11–12 % missed frames and no change (runs 2–3) | 59.5–60 fps at medium (runs 1 and final2); with the judder rule's first version 54 fps at high 85 % (final3), fixed by its guard (unit test); the last run (final4) was under outside load (fixed medium read 55.6 fps) and ended at low at 48 fps |
| WebGPU, Automatic, adjust on | 60 fps at `low` 100 % (1512 × 945: the M2's name guess) | 60 fps at `medium` 100 % (2268 × 1417), raised on calibrated evidence |
| WebGL, High, adjust on | 42.2 fps, stuck at medium 85 % with 44 % missed frames | 50.2 fps at low (the judder rule) |
| load, WebGPU Medium adjust off | 17.0 s | 17.2 s (nothing warmed) |
| load, WebGPU with adjust on | 6.3–11.7 s | +2.8 to +3.0 s for the one warmed preset (`presetWarmMs`) |

Switch stalls (`STEPS=1`, longest frame in the 1–1.5 s after the switch):

| Switch | before | after |
|---|---|---|
| render scale 1 ↔ 0.85 | 18 / 33 ms (= steady frames) | same |
| medium → low | 1517 ms | 83 ms (warmed) |
| high → medium | 3167 ms | warmed when the governor starts on high |
| low → medium | 200 ms | 117 ms |

## What surprised me

- **Resolution steps cost nothing.** The planned "reserve the largest target and render a sub-rectangle" was not needed. three r186 keys pipelines by the target object, not its size.
- **The JS heap at 869 MB** in one run with adjust on was garbage, not a leak: 88 MB after a forced GC, flat over a minute. The churn is about 1.2 MB a frame either way (plan 363).
- **Warming every other preset cost 3–6 s each at load.** Only the preset the governor reaches first is warmed now, and only while it may adjust.
- **The first judder rule (20 % over 3 s) missed a 54 fps `high`.** At 10 % it fired, but under a background load it sank the M2 to `low` 55 % and a 30 lock (run final2, `medium` with adjust on). The guard came from that: a resolution drop that does not help goes to the next preset, and a preset drop that does not help holds.
- **The machine was shared.** The desktop app's renderer at up to 150 % CPU and other sessions' jobs ran outside the heavy lock. Identical configurations varied by up to 15 fps between runs. The tables list runs, not best-ofs.

## Not verified

- **The owner's M5 at 120 Hz on battery.** The M2's display is 60 Hz. The frame-rate limit's Display default means Automatic now draws at the display's rate as a fixed preset does, so the owner's "Medium 100 fps" comparison holds by construction. The level Automatic picks there is measured only in the unit tests (`the owner's M5 in orbit` case).

## Verification output

```
bun test packages/renderer/test/quality-governor.test.ts   40 pass, 0 fail
bunx vitest run src/lib/graphics.test.ts                   8 passed
bun test packages/renderer                                 766 pass, 0 fail
bun run typecheck                                          0 errors (svelte-check 2223 files)
bun run docs:check                                         OK
```
