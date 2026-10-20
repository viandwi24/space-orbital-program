# 0234 — A pixel budget for the planet pass, and the other Retina quick wins

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/252-graphics-retina-quick-wins.md
**Builds on:** ADR 0053 (graphics presets and the governor), ADR 0061 and 0064 (the half-resolution planet pass), ADR 0086 (the baked cloud-shadow map), ADR 0055 (the post chain), journal 048 (PMREM recaptures)
**Research:** `refs/graphics-performance/` (01 diagnosis, 02 measurements, 06 plan and cost: phase 1)

## Context

Every frame-time budget in this repo was set at 1920 × 1080 with pixel ratio 1 (2.07 Mpx). `high` caps the pixel ratio at 2, so a 14" Retina screen draws 5.7 Mpx. Almost all of a frame is the fullscreen planet pass (sky, clouds, light shafts, terrain), which costs per pixel: on the M2 the frame time follows the pixel count almost linearly. The governor sees only the frame interval, so it steps down late and retries upward by timer.

## Decision

1. **A pixel budget for the planet pass, not a pixel-ratio cap.**
   - `PresetSettings.planetPixels` is the most pixels the planet pass may draw. The scale is `budgetScale(w, h, budget)`: the largest side scale in [0.5, 1], in steps of 0.05 rounded down, whose area is within the budget; 1 when the target fits or the scale would be over 0.9 (too close to 1 to repay the upsample).
   - The pass runs at the smaller of that and the governor's wish (`setPlanetScale`), so the governor's half rung still goes lower, and the governor's "full" is the budget's rung.
   - The vessel, the meshes and the HUD keep the full pixel ratio: the upsample of ADR 0061 puts the planet colour and depth back at full size, and the edge pass of ADR 0087 redraws the pixels where the low-resolution texels disagree.
   - The shaders already work from the ratio of the two target sizes, so a scale other than 0.5 needs no new shader. The edge pass's `uMarchScale` (the march prepass texel per pixel of that draw) follows the active scale instead of the constant 0.5.
   - The default budget is 1.75 Mpx for every preset, a little under a 1920 × 1080 frame (2.07 Mpx). At 1512 × 945 CSS and ratio 2 the pass runs at 0.55 of the side (1.73 Mpx). 1080p at ratio 1 stays at full size, 1440p gets 0.65, 4K 0.5. Plan 251's M5 baseline chose it: the frame cost follows the planet pass's pixels, and at the first starting value (2.07 Mpx) `high` read 17.8 / 16.8 / 18.6 ms at the pad, 3 km and 12 km with the governor still bouncing between 100 % and 85 %.
2. **Baked cloud shadows on `high`:** `cloudShadowMap: true`, `cloudShadowOctaves: 0`, as `medium` since ADR 0086. The noise costs about 1.0 ms at 1080p against about 0.1 for the map. One line reverts it if the look check shows a loss.
3. **MSAA from pixel ratio 2 up:**
   - The scene target takes at most 2 samples (`msaaSamples`). The decision uses the preset's ratio before the governor's render scale, so a render-scale step does not rebuild the chain.
   - The canvas is multisampled only below ratio 2 (`canvasAntialias`, decided when the context is created): it only receives the post chain's output quad. `low`, which draws into the canvas directly, keeps no canvas MSAA on a dense screen; it is capped at pixel ratio 1 and so reads soft on a Retina screen, which is the device class it is for.
   - **No change to the composer's ping-pong buffer.** The plan asked for a non-MSAA ping-pong target. With the pass order RenderPass, bloom, output, three's `EffectComposer` draws only into its read buffer (the scene and the bloom blend) and the output pass writes to the canvas; the write buffer is never drawn into, so it is never allocated and costs nothing. A non-MSAA one would change nothing.
4. **Shadow map at most 2048 from pixel ratio 2 up** (`shadowSizeAt`): each shadow texel covers more of the screen on a dense one. A map that is not yet allocated is sized at once; a change of display shrinks it in place; growing keeps the settle frames of the preset switch.
5. **Image-light recaptures spaced:** a new environment key (every 2° of sun, every half octave of altitude) takes a PMREM capture (5 to 6 ms in one frame) at most once per `ENV_RECAPTURE_MIN_MS` (1500 ms). In between the old cube lights the scene a little off. The first capture and a different graphics preset are not held back. Spreading one capture over several frames would need an incremental PMREM, which three.js does not offer; the rate limit takes the bulk of the ascent's cost.

## Deferred

- The governor's rules (pixel-ratio aware, Valve-style, locked 60/30, no timer retries): plan 253 and plan 201.
- A scale below 0.5 and other upsamplers (EASU, temporal): phases 2 to 5 of the research.

## Consequences

- A Retina screen runs `high` at about its 1080p cost in the planet pass without the governor having to step down first.
- The planet pass can run at 0.55 to 0.95 of the side: the upsample and the edge pass now see non-integer ratios. The tests cover the scale and the active rung; the look is checked on the screenshot set in the journal.
- A preset that carries `planetPixels: 0` has no budget: a mod or a later "ultra" preset can spend it.
