# 0375 — Keep three.js; fix our own costs first, and move only hot world passes to raw WebGPU when a profile asks for it

**Status:** accepted
**Date:** 2026-11-08
**Plans:** plans/416-earth-at-night-and-from-orbit.md, plans/417-ground-relief-cliffs-and-rock.md, plans/418-smooth-and-stable.md
**Builds on:** ADR 0330 (graphics v2 targets)

## Context

On 2026-11-08 the owner tested on the M5 and reported three things:

- Earth's land, cliffs and clouds lack detail, above all from orbit.
- There are no city lights at night.
- The game is still not smooth: it lags and is unstable.

The owner asked whether to change library or engine. They also noted that KSP is far ahead in both looks and performance.

Our own measurements (refs/graphics-v2/07, plans 414 and 415) and an external survey (Babylon.js, PlayCanvas, Bevy, Godot web, Unity 6 WebGPU, raw WebGPU) found the following:

- **Orbit already holds 120 Hz on the M5** (8.3 ms). The pad does not: it runs at 16–20 ms.
- **We draw about 120–180 calls per frame.** Another engine would mainly lower the CPU cost per draw. At our draw count that saves well under 1 ms.
- **The cost lies elsewhere:**
  - pixels and the frame end, about 70 % of the frame;
  - the launch site as a whole, about 6 ms at the pad, of which 3.5 ms is unexplained;
  - memory churn: the "Array buffer allocation failed" errors and GC pauses;
  - background warming and rebakes.

  All of these are in our own shaders and code, and they would move with us to any engine.
- **Porting would rewrite most of `packages/renderer` (about 59k lines of TSL).** That covers the planet pass, Hillaire sky, CDLOD, clouds, TAAU, ocean and plasma, and would take 6–12 months with the game unplayable in between.
- **The poor looks come from data and presets, not from three.js:**
  - Earth is all runtime noise, with no relief finer than about 2 km.
  - The orbit bake on Low is 512 per face, about 1.9 km per texel.
  - City lights exist but are off on Low (the new-player default since 2026-10-25), and are dim (gain 0.12) everywhere.
  - The orbit cloud shell is a 2048 map without mipmaps.

## Decision

1. **No engine change.** We stay on three r186 (WebGPU with a WebGL2 fallback, TSL).
2. **Looks that cost no frame time are on at every preset.** Cheap-but-visible looks, such as city lights, the orbit bake's resolution and cloud-shell mipmaps, are chosen by device memory, not by the preset. Low cuts per-pixel work, not data resolution.
3. **Detail is baked, not marched.** Fine albedo, normals and city lights for orbit are computed once into the scaled-space atlases, a one-time cost at load. The per-frame shader reads them.
4. **Smoothness is measured as stability**, not as p95 only. perf:gate gains a heap soak, an allocation-rate budget and a long-frame budget per minute. A plan that adds a per-frame allocation in a hot path fails the gate.
5. **Raw WebGPU for hot passes, only on evidence.** This is the "outside the library" path. three exposes its device through `renderer.backend.device`. A pass may be rewritten in our own WGSL, using render bundles, one indirect buffer and compute culling, while TSL stays as the WebGL2 fallback. Two conditions must both hold: a Metal or Chrome trace shows that pass over budget, and the TSL version cannot be fixed. The first candidate is the CDLOD terrain draw.
6. **Re-evaluate the engine only** if a profile shows three's own internals holding over 30 % of the frame.

## Consequences

- The work is three plans that can run in parallel: 416 (night and orbit), 417 (relief and rock) and 418 (smooth and stable).
- Low on the M5 looks close to Medium from orbit, while its per-frame cost stays Low's.
- Sources: refs/graphics-v2/02 and 07, three.js issue #30560, and Toji's WebGPU best practices (render bundles, indirect draws).
