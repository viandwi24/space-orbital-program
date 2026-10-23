---
id: 401
title: "Ocean v2: sky reflection from the LUT sky, scrolled detail normal maps, a 64² FFT in WebGPU compute at high"
status: done
owner: "Worker C"
depends: [393]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 401 — Ocean v2

## Goal

Home's sea reflects the real sky: the horizon glow, the sunset colours and the dark zenith, taken from the LUT sky rather than one uniform colour, as in reference image 04. Close up, scrolled detail normal maps break the regular sine pattern. At `high` on WebGPU a 64² FFT in compute gives real wind waves; WebGL2 keeps the analytic waves. Low and Medium are cheap versions that hold a locked 60 on the lower targets (base M2; Windows PCs with Intel Iris Xe or AMD 680M integrated graphics, or GTX 1650 / RTX 3050 class cards, in Chrome or Edge on D3D12).

## Context

- Design: `refs/graphics-v2/README.md` (look 4); ADR 0330 §3 and §4 (ocean and sky coefficients are mod data, plan 405).
- Research:
  - `refs/graphics-v2/01-ksp-and-mods.md` §4 (`:84-119`): Scatterer's FFT ocean (64/128/256, "one of the most performance taxing", `:93-97`), sky reflection "negligible" in cost (`:96`), and the order of cost: scrolled normal map with Toksvig, then a 64² FFT at `high`, never above 128² (`:115-118`); mods supply only coefficients and ocean colours (`:119`).
  - `refs/graphics-v2/03-renderer-and-mod-audit.md` A2 (`:40`, the seven-component sine sea), A6 (`:150`): reflection is Fresnel × one uniform `uSkyColour` (`R/tsl/planet-pass.ts:~2222`, the uniform at `:624`), no displacement, only Home has a sea; `:151` the Hillaire LUT sky and its sky-view table (`R/tsl/lut-sky.ts:8,54`).
  - `refs/graphics-v2/02-browser-120fps.md` (the 7 ms GPU budget).
- ADRs: 0182 (water), 0306 (baked sky), 0249 (WebGPU and WebGL renderers), 0308/0310, 0330.
- Code: `packages/renderer/src/water-model.ts:24-32`, `packages/renderer/src/tsl/planet-pass.ts` (sea branch), `packages/renderer/src/tsl/lut-sky.ts`, `packages/renderer/src/shaders/` (the GLSL planet pass), `packages/renderer/src/shore-wave.ts`.
- Plans: 393 (TAAU; wave detail must not shimmer under it), 392 (baseline), 397 (clouds v2; clouds in the reflection read its coverage if cheap), 404 (switch and quality).
- Reference image: `refs/graphics-v2/reference/04-ocean-scatter.webp`.

## Scope

**In:**
- Reflection: sample the sky-view LUT in the reflected direction (WebGPU), and the existing per-pixel sky on WebGL2 at a reduced step count; keep Fresnel and the Toksvig-widened sun glint. A cheap cloud term from the 2D cloud map in the reflected direction.
- Two scrolled detail normal maps (generated at load, tiling), blended with the analytic waves and faded by footprint (journal 261's rule).
- At `high` on WebGPU: a 64² FFT (Phillips or JONSWAP spectrum from wind speed and direction) in compute, written to a displacement-free normal and foam texture tiled over the sea; the analytic sea everywhere else and on WebGL2.
- Quality levels, as preset fields for plan 404:
  - Low: today's analytic sea with the LUT reflection (one extra lookup), no detail normals, no cloud term;
  - Medium: plus the scrolled detail normals and the cloud term;
  - High / Ultra: plus the 64² FFT on WebGPU.
- Ocean colour and wind as named coefficients (the shape plan 405 will open to mods).

**Out:**
- Geometric displacement, underwater views, caustics, screen-space reflections of vessels.
- Seas on bodies other than Home (plan 406).
- FFT above 64² (128² only if the owner asks after the measure; never above, per `01:118`).

## Design notes

- The FFT runs at a fixed interval (for example every second frame at 120 Hz) and is not tied to the governor's scale; the governor may drop the level from FFT to normals, which builds no pipeline because both are warmed at load.
- The planet pass has a 16 sampled-texture limit (`03:240`, journal 364): count bindings before adding the detail normals and the FFT texture; pack them if needed.
- Keep shore swash, foam, lakes and rivers working with the new normal.

## Steps

1. Capture "before": the coast at 500 m at noon and at sunset, 12 km, and 100 km orbit over the sea.
2. Sky reflection from the LUT (TSL) and the reduced sky march (GLSL); cloud term.
3. Scrolled detail normal maps with footprint fade.
4. The 64² FFT compute pass at `high` on WebGPU; foam from the Jacobian.
5. Quality fields and warm list; binding count check.
6. Capture "after", frame-time check against plan 392, journal.

## Acceptance criteria

- [ ] `bun test packages/renderer` passes, including `test/ocean-fft.test.ts`: the spectrum is deterministic for a seed, its energy matches the wind speed within 5 %, and a 64² inverse FFT of a single mode returns that mode (CPU reference of the compute kernel).
- [ ] `test/water-model.test.ts` (extended): detail normals fade to the analytic normal as the footprint grows; the reflected direction for a flat sea at the horizon samples the LUT's horizon row.
- [ ] A binding-count test for the planet pass: at most 16 sampled textures at every quality level.
- [ ] The warm-list test includes the sea variants for every quality level.
- [ ] `bun run typecheck` and `bun run docs:check` pass.
- [ ] e2e paused by the owner: none added.
- [ ] A quick look in a browser on WebGPU and WebGL; before and after screenshots in `docs/journal/assets/401-*.jpg`.
- [ ] No frame-time regression against plan 392's baseline at the coast and orbit views at `medium`; at `high` the FFT's cost is measured and reported, and the wave keeps the 7 ms GPU budget.
- [ ] Low and Medium hold a locked 60 at the coast view on the lower targets: measured with Chrome's CPU and GPU throttling as a stand-in, and on a Windows integrated-GPU machine when the owner can run it ([manual] for the real machine); the journal states which.
- [ ] [manual] The owner looks at the sea at noon, at sunset and from orbit against reference image 04.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/401-ocean-v2.md` written.
- [ ] `docs/architecture/overview.md` (planet pass): the sea's reflection and FFT.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Done (Worker C): the GPU FFT as fragment passes at High, the WebGL2 reflection and the cloud term were added after 393 landed; see journal 401. Left: the owner's look ([manual]).
- 2026-10-24 — Partly done (Worker C): sky reflection from the LUT on WebGPU, the scrolled detail normals, the CPU FFT reference and the `ocean` quality. Left: the WebGPU compute FFT and its textures and foam, the WebGL2 reflection and the cloud term, captures and frame times, the owner's look.
