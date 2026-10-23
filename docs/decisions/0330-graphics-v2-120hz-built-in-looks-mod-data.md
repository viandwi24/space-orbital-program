# 0330 — Graphics v2: a locked 120 Hz, built-in looks with quality settings, mods supply visual data

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/390 to plans/406 (graphics and performance v2); design in `refs/graphics-v2/README.md`
**Builds on:** ADR 0053 (frame budget), ADR 0249 (WebGPU and WebGL renderers), ADR 0308 and 0310 (warm every reachable pipeline at load), ADR 0057 (mods are data), ADR 0160 (glTF parts)
**Amends:** ADR 0053 (the budget is per refresh at 120 Hz, not 60), ADR 0233 and the plan 362 governor (the fast axis is the TAAU input scale)

## Context

The owner wants the MacBook Pro M5 at Retina to run at a stable 100–150 fps with better looks. The targets are seven reference looks: re-entry colours, aero effects, engine plumes, ocean and scattering, terrain detail, volumetric weather, and planets from orbit. Mods should be able to bring planets, textures, models and visual changes.

The research is in `refs/graphics-v2/01`–`04`. Two findings drive this decision:
- **Pixels are about 70 % of our frame.** Retina `high` takes 15–21 ms.
- **KSP 1's visual mods replace renderer pieces and conflict, and KSP 2 built the same techniques into the engine.**

## Decision

1. **Target.** Chrome and Edge aim for a locked 120 Hz; Safari, which caps ProMotion near 60, aims for a locked 60. The budget per frame is ≤ 7 ms of GPU time and ≤ 4–6 ms of main-thread time. Acceptance uses the p95 frame interval, not the average.
2. **Resolution.**
   - The 3D image renders at a fraction of the canvas, about 0.6 of the side, and is rebuilt with temporal anti-aliased upscaling (TAAU). This replaces MSAA and the planet pass's own upsample.
   - FSR 1 covers frames without valid history (camera cuts) and the WebGL2 path.
   - The governor's fast axis is the TAAU input scale. Changing it allocates nothing and builds no pipelines.
3. **Looks are built in.**
   - The engine owns every technique: plasma shell and palettes, condensation, plume templates and controllers, sky and ocean, clouds and weather, terrain detail and rocks, orbital textures, and post-processing profiles.
   - Each look has a player switch and a quality level.
   - An *Ultra* preset spends the time the savings free up.
4. **Mods supply data, not shaders.**
   - **Data a mod can supply:**
     - per-body plasma palettes;
     - plume templates per engine;
     - cloud and weather maps;
     - sky and ocean coefficients;
     - post-processing profiles;
     - planet albedo, height and normal maps;
     - glTF parts and buildings.
   - **Planet height maps** feed the sim's terrain, so a mod planet's collision matches what is drawn.
   - **Shader-level hooks are deferred.** Every pipeline must be compiled and warmed at load (ADR 0308/0310), and untrusted shader code cannot be checked.
5. **Order of work.** Physics fixes come first, then performance, then looks, then mod data. One worker owns the renderer core, so passes do not collide.

## Alternatives considered

- **Shader hooks for visual mods (KSP 1 style).** Rejected for now. Mods would conflict, mod shaders could not be warmed, and every visual mod would need two backends (WebGPU and WebGL2).
- **Chasing a 100 fps average.** Rejected. On a 120 Hz panel a missed slot judders, so the target is a lock.
- **A deferred renderer.** Rejected. Its gains do not carry over to three's forward WebGPU path (research 01).

## Consequences

- Plans 390–406 carry the work.
- Draft 368 folds into 392 and 394. Drafts 367 and 369 run after 396.
- The mod format gains new data fields, with larger caps and KTX2/WebP support (plan 405).
- The frame-rate setting gains 120. The governor and its tests change (plan 395).
