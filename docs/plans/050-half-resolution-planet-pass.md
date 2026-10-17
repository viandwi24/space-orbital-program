---
id: 050
title: "Half-resolution planet pass and cloud shadows on medium"
status: done
owner: "half-res session (Claude, 2026-10-17)"
depends: [048]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 050 — Half-resolution planet pass

## Goal

The flight view holds its frame budget on GPUs slower than the Apple M5 the presets were tuned on (M1/M2 and Intel are the ADR 0025 budget machines, none was available to plan 039): the quality governor (ADR 0053) gets a rung that draws the planet pass (sky, ground, sea, clouds, atmosphere: about three quarters of the frame) at half the side, upsampled with a depth-aware filter, while the vessel, the site meshes and the HUD stay at full resolution. The default path (the player's preset at full resolution) does not change.

## Context

- Split out of plan 048 at its refinement. ADR 0053 (alternatives: the half-resolution pass needs a float depth target next to the colour one so the vessel meets the ground at full precision, and it softens the pad markings and the grass); journal 039 (method, frame table); ADR 0059 (point 5: no half-resolution cloud buffer, "plan 050's job"); journal 048 (hitch bound), journal 023 (final frame table).
- `medium` met its target by cutting cloud and ground octaves, so the largest possible saving (3 of 4 pixels of the planet pass) was not needed on the M5; it is needed for slower GPUs.
- Release bar: [`product/visual-direction.md`](../product/visual-direction.md): no visible quality loss on the default path. The half rung is reached only when the governor measured a slow frame, as an alternative to rendering everything at 0.7.
- Verified 2026-10-17 (recorded in `docs/research/three.md`, "Plan 050"): nearest-depth and bilateral upsampling of half-resolution passes (the 4 taps, bilinear weights times a depth similarity, reference depth); `WebGLRenderTarget` options (`depthBuffer`, `count`, `samples`) read from the repo's three 0.186.1 source; the log-depth fragment depth the planet pass writes is `log2(1 + z) / log2(far + 1)`, so a depth difference times `log2(far + 1)` is a number of octaves of distance.

## Scope

**In:**
1. Half-resolution planet pass with a depth-aware upsample, as governor rungs (ADR 0064). Pad, grass and the near ground are not exempted: the measurement showed the pad markings softened but not broken (criterion on the screenshots), and a per-pixel hybrid would mean running the full pass as well.
2. Cloud shadows on `medium`: `CLOUD_SHADOWS` was tied to four cloud octaves; a separate preset field (`cloudShadowOctaves`) gives `medium` the shadows back at two octaves if the measurement says it fits the `medium` budget.
3. Measurements on M1/M2, Intel and a phone-class GPU: **no such hardware is available**; stated, not faked. Draft 038 keeps the item.

**Out:** temporal reprojection and a half-resolution cloud buffer with history (ADR 0059); MSAA of the planet pass; the moon pass (a mesh, not a fullscreen pass); any change of the default preset or `selectPreset`.

## Design

- `PlanetPass` draws its material into a float RGBA target at half the scene target's side (alpha = the fragment depth the pass writes), and a full-resolution `planet-upsample` material takes the pass's place in the scene: four taps, bilinear weights times `exp(-(octaves/0.5)^2)` of the depth difference to the nearest tap, colour and depth written (`gl_FragDepth`), so the vessel is depth-tested against the interpolated depth. One program for both resolutions (`uPackDepth`), no recompile on a rung change.
- Ladder per preset: full, 0.85, planet at half (frame 1), planet at half (frame 0.7); `low` also 0.55 with the half planet. Without `EXT_color_buffer_float` the half rungs are left out.
- `half-res.ts` is the tested twin of the weights.

## Steps

1. Refine (this document, ADR 0064, research). Baseline frame table of full against half at the six scenes.
2. `half-res.ts`, `upsample.glsl.ts`, the planet pass's half target, `Renderer.setPlanetScale`, precompile of the new programs.
3. Governor ladder, `flight-loop.ts` applying `planetScale`, tests.
4. `cloudShadowOctaves` and the `medium` measurement.
5. Frame table before and after at low, medium, high; screenshots; hitch check; full suites; docs.

## Acceptance criteria

- [x] **Weights and ladder tested**: `bun test packages/renderer` has tests for the upsample weights (bilinear on one depth, no leak across a depth edge, never zero or negative, depth within the carrying texels; a mutant that drops the similarity makes three of them fail) and for the ladder (order of the rungs, the half rung before the next preset, no half rung without float targets, the floor).
- [x] **Frame times** (journal 039/023 method: production build served static, Apple M5, 1920 x 1080 at ratio 1, governor off, minimum over 20 windows of 8 synced frames, hidden pane, page loaded at the preset measured): a table for `low`, `medium` and `high`, full against half, at the pad, 3 km, 12 km, orbit (100 km), the hillside (two view directions) and the moon surface. On `high` the half rung cuts the time of the planet pass plus the post chain (everything else hidden) by at least 45 percent at the pad, 3 km and the hillside, and the whole frame by at least 35 percent at the pad and 45 percent at the hillside. The ladder's half rung costs no more than the 0.7 rung it sits beside (same table).
- [x] **Visual check**: screenshots at 1920 x 1080 of the pad (`pad-morning`) and on the moon surface, full against half, in `docs/journal/assets/050-*.png` with a crop of the vessel on the ground at 3x; blurred (Gaussian 12 px) mean absolute difference of the pad at most 2/255 and mean colour within 1.5/255 (the raw difference is reported: edges and grass move); by eye no stair-stepping or halo where the vessel meets the ground.
- [x] **Cloud shadows on `medium`**: `medium` has cloud shadows again if it stays within 13.3 ms sync on the M5 at the pad, 3 km, 12 km, orbit and the hillside (worst of the view directions); if it does not, the field stays 0 and the log says by how much.
- [x] **Hitch**: a `setPlanetScale` change adds no frame above 4x the steady frame; a preset switch's hitch is not worse than journal 048's (worst 44.7 ms).
- [x] M1/M2/Intel measurements: not available here; the journal says so (draft 038).
- [x] `bun test packages/renderer`, `bun run test`, web vitest, `bun run typecheck`, `bun run build`, `bun run docs:check` pass; prettier clean.

## Docs checklist

- [x] STATUS, journal 050, ADR 0064, research (three.md), visual-direction note if the bar changes (it does not), draft plans for what is pushed out.

## Log

- 2026-10-17 — Split out of plan 048 (refinement by the switch session).
- 2026-10-17 — Refined draft → ready at the human's request (session: half-res session). Criteria made measurable; the order of the rungs is decided by the first measurement (half at frame 1 costs about what the frame at 0.7 costs and keeps the vessel sharp).
- 2026-10-17 — Started (half-res session). First measurement at `high` (journal-039 method, M5): half rung pad 13.9 to 8.2 ms, hillside 12.9 to 5.9; the pass costs less than 0.7 scale (8.5 and 7.1).
- 2026-10-17 — Executed (half-res session). Criteria: tests 346 pass in the renderer (7 new for the weights, a mutant that drops the similarity fails 3; ladder tests); frame table in journal 050 (`high` pad 15.45 to 8.85, 3 km 10.86 to 5.47, hillside 14.0 to 6.3; planet pass plus post chain minus 50/55/58 percent at the pad, 3 km and hillside; half at frame 1 costs no more than everything at 0.7); pad blurred difference 1.3/255, mean colour within 1, no halo at the vessel/ground contact (assets 050-*); `medium` cloud shadows cost 1.0 to 1.2 ms and put the hillside over 13.3 ms, so the criterion's alternative applies: `cloudShadowOctaves` stays 0 on `medium` (draft 056); hitch of a rung change at most 19.5 ms, preset switches the same as unchanged HEAD in the same session; M1/M2/Intel not available. ADR 0064.
