# 0064 — The planet pass at half resolution as governor rungs, with a depth-aware upsample

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/050-half-resolution-planet-pass.md
**Builds on:** ADR 0053 (quality governor, march prepass), 0027 (presets), 0055 (no recompile on a switch), 0059 (no half-resolution cloud buffer).

## Context

The planet pass (sky, ground, sea, clouds, atmosphere) is one fullscreen shader and almost the whole frame: 9 to 12.5 ms of the 13 to 14 ms of `high` at the pad and the hillside on the M5, with the post chain and MSAA included (plan 050, journal 050). ADR 0053's governor lowers the render scale of everything (0.85, 0.7) and then the preset; it has no way to spend fewer pixels on the planet only. The vessel, the site meshes and the HUD are the part of the picture that must stay sharp, and none of them is in the planet pass.

## Decision

1. **The planet pass can draw at half the side of the scene target** (`PlanetPass.setPlanetScale(0.5)`, `Renderer.setPlanetScale`). The pass's material is drawn into a float RGBA target (no depth buffer) whose alpha holds the fragment depth the pass writes (`uPackDepth`, one program for both resolutions: no recompile on a rung change); a full-resolution `planet-upsample` material takes the pass's place in the scene. The pass's pixel angle doubles, so every footprint-driven fade (noise octaves, grass, slope shading, the sun-shadow march cut-off of ADR 0053) is filtered for the half-resolution pixel, and the march prepass runs on the pass's own size.
2. **Depth-aware upsample** (`shaders/upsample.glsl.ts`, tested twin `half-res.ts`): the four nearest texels, bilinear weights times `exp(-(d / 0.5)^2)` where `d` is the number of octaves of distance (the log-depth difference times `log2(far + 1)`) between a texel and the nearest one. A smooth surface is filtered bilinearly, a depth edge (ground against sky, a ridge against its valley) is never blended across, and the nearest texel keeps its own weight so the sum is never zero. The shader writes the colour and the interpolated `gl_FragDepth`, so the vessel, drawn afterwards at full resolution, is depth-tested against the ground as before. The tone mapping and colour space of the planet pass move into the upsample (the half-resolution target is linear), so `low` (drawing to the canvas) is not tone-mapped twice.
3. **Governor ladder**: per preset `full, 0.85, half planet at 1, half planet at 0.7`, then the next preset; `low` adds `half planet at 0.55`. Measured on the M5 at 1920 x 1080 (journal 050): half at scale 1 costs about what the whole frame at 0.7 costs (pad 8.2 against 8.5 ms, hillside 5.9 against 7.1 on `high`) and keeps the vessel sharp, so it sits right after 0.85. Without `EXT_color_buffer_float` the half rungs are left out (`QualityGovernor(ceiling, config, halfPlanet)`, `Renderer.halfPlanetAvailable`). `GovernorLevel` gains `planetScale`.
4. **Cloud shadows have their own field**, `cloudShadowOctaves` (0 = none; `high` 4, `medium` 0, `low` 0), replacing the test on `cloudOctaves >= 4`. Measured on `medium` (journal 050): the ground cloud shadow costs 1.0 to 1.2 ms at the pad and the hillside whether it reads two or three octaves (the cost is the domain warp and the first octave, not the later ones), which puts the hillside's worst direction (13.3 ms without) over the 13.3 ms budget. `medium` therefore stays without shadows; the field and the shader parameter (`CLOUD_SHADOW_OCTAVES`) are there for a cheaper form (a baked shadow map of the cloud field is the idea, not done).

## Alternatives considered

- **Full-resolution near ground, half-resolution far ground** (the draft's "inside the flat site zone"): needs both passes or a per-pixel branch in one shader (the cost of the full pixels stays, the saving shrinks to the sky), and the measurement showed the pad markings and grass soften but are not broken at 2 x 2 (journal 050 crops). Not done.
- **Bilateral weights against a full-resolution depth**: there is no full-resolution depth before the planet pass (it produces it). The reference is the nearest half-resolution texel instead.
- **A multiple-render-target pass** (colour half float and depth float side by side): needs `GLSL3` output declarations in a shader that three patches for `gl_FragColor`; one RGBA32F target costs 16 bytes per half-resolution texel (4 per full-resolution pixel), which is less than the saving.
- **Replacing the 0.7 rung by the half rung**: 0.7 stays below it for machines that still miss the budget with the half pass.
- **Temporal reprojection** to hide the 2 x 2 steps at cloud edges and ridges: no history buffer exists (ADR 0059); post-v1.

## Consequences

- At the half rung the far ground loses fine detail about twice as near as at full resolution, the sky and cloud edges show 2 x 2 steps, and the mean colour of a 3 km view moves by about 4 of 255 (journal 050). The default path (the player's preset at full resolution) is byte-identical in what it draws: alpha is 1 as before and the upsample is not in the scene.
- `precompile` compiles the upsample in both target states and the planet pass for the canvas-drawing preset in the float-target state; a `setPlanetScale` change costs no frame above 20 ms (journal 050).
- On the moon surface the rung saves under 1 ms (the moon is a mesh pass, not the planet pass); at orbit about 0.7 ms.
- Not measured on M1/M2, Intel or a phone-class GPU (none available): the ladder's order is by M5 cost.
