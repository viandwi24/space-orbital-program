# 393 — TAAU

**Plan:** [plans/393-taau.md](../plans/393-taau.md) · **Session:** Worker A, 2026-10-24 · **ADRs:** [0336](../decisions/0336-taau-temporal-upscaling.md), 0330, 0248

## What was done

| Where | What |
|---|---|
| `renderer/renderer-webgpu.ts` | the TAAU pipeline (scene pass at a share of the side, MSAA off, velocity output, `TAAUNode`, bloom and output after it); the preset's `taau` and a debug override (`setTaau`); cuts reset the history |
| `renderer/tsl/planet-pass.ts` | the full pass's rays from the camera's own (jittered) matrix; the planet's velocity from depth and the last frame's camera in a second material used under TAAU; `cut()` |
| `renderer/taau-cuts.ts` | the cut detector (view, pipeline, size, field of view, quick turn); tests in `taau-cuts.test.ts` |
| `renderer/presets.ts` | `taau` per preset: `medium` 0.5 |
| `web/scripts` | `capture-taau.ts` (off, on, turning, after), `measure-120hz.ts` takes `TAAU=` |

## Findings

- The planet needed its own velocity: it is a screen quad in the scene pass, whose own velocity is none; the jitter needed the planet's rays to read the camera's matrix at draw time.
- A material with an `mrtNode` loses its colour in a pass without a velocity output: the planet has a second material for TAAU.
- `medium` at 0.5: 3 km 69 to 106 fps, 12 km 83 to 102; the pad and the orbit were at 120. `high` gains nothing at 0.5 and loses at 0.6: its cost is not the pixels. The numbers are in the ADR; the three runs are in `refs/graphics-v2/data/m5-taau*-*.json` (the first two were disturbed by load 12 to 17).

## Look check

`apps/web/scripts/capture-taau.ts` at `high` 0.6 (pad and orbit, 3024 × 1890): standing, the TAAU image matches the direct one in the crops I looked at, edges clean, no ghosting on the vessel; mid-turn it is softer at the vessel, as a history of the old view is blended in for a few frames. Frames are in `docs/journal/assets/393-taau-*.jpg`.

## Not done

- FSR 1 on cut frames and on WebGL2; the cut frame is a bilinear upscale of the current frame.
- Targets at their maximum size (a scale change reallocates; 395).
- The owner's look check of `medium` with TAAU, a roll under thrust, plumes and plasma at speed, and `capture-graphics.ts` before and after.
- `measure-sunrise.ts` with `STEP_TO` for "no pipeline compiled on a cut": cuts only reset a history, nothing compiles, but it was not measured.
