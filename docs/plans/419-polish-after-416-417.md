---
id: 419
title: "Polish after 416 and 417: no black shadow blots on Low cliffs, city lights without a block pattern, and a cirrus that is not a blur from orbit"
status: ready
owner: "Worker D"
depends: []
phase: 9
created: 2026-11-08
updated: 2026-11-08
---

# 419 — Polish after 416 and 417

**Size:** S–M

## Goal

The coordinator reviewed the screenshots of plans 416 and 417 and found three artefacts. Fix each one without adding per-frame cost.

1. **Black blots on Low cliffs.** `docs/journal/assets/417-after-low-hill3k.jpg` shows hard, oval, fully black shadow blots on the terraced massif. They are most likely Low's new 3-step terrain shadow (ADR 0375 addendum, point 10) undersampling the 5-step cliff terraces. A shadow there should be soft and partial, never a black hole.
2. **City lights in blocks.** `416-after-webgpu-low-night400.jpg` shows the lights as a blocky, camouflage-like pattern of square cells. They should read as organic clusters with bright cores, dimmer suburbs and thin lines between towns.
3. **Cirrus blur from orbit.** In `416-after-webgpu-low-day400.jpg` the old cirrus layer is still drawn under the new far shell as a streaky blur (journal 416). Either fold it into the shell's detail or fade it out from orbit, so the clouds from orbit read as one layer with relief.

## Context

- ADR 0375 and its addendum.
- Journals 416 and 417.
- Code:
  - `packages/renderer/src/night-lights.ts` and `bake-detail.ts`;
  - `tsl/planet-pass.ts` (the terrain-shadow block and the cirrus);
  - `shaders/planet.glsl.ts`, the WebGL twin;
  - `cloud-far.ts`;
  - `presets.ts`.
- Scripts: `apps/web/scripts/capture-416.ts`, `capture-417.ts` and `measure-416.ts`. Every browser is muted (worker brief).

## Steps

1. Reproduce each artefact with the capture scripts, at the same views and presets.
2. Fix the shadow. Options:
   - clamp the shadow strength and soften it by step distance;
   - jitter the steps with interleaved gradient noise, which TAAU or the eye smooths;
   - take the shadow from the coarse height only at Low.
3. Fix the lights. Options:
   - a cell-free noise, for example a smooth value or gradient noise, not a hashed grid;
   - sub-texel sparkle in the shader rather than in the bake;
   - the bake's filter.
4. Fix the cirrus from orbit.
5. Run the WebGL twin and take after screenshots.
6. Check orbit and pad frame time with an interleaved A/B on the M5. Run the dusk probe and the texture gate.

## Acceptance criteria

- [ ] No fully black blots on Low cliffs at 300 m and 3 km. Side-by-side screenshots show it.
- [ ] City lights from 400 km show no square cell pattern. Shown at Low and High, on WebGPU and WebGL2.
- [ ] Clouds from orbit show no separate streaky blur layer.
- [ ] Orbit and pad frame time stay within +0.2 ms at Low and High, measured interleaved and headed with the measuring flag.
- [ ] The dusk probe builds 0 pipelines (at High; Low already built 2 on a clean tree). The texture gate passes.
- [ ] `bun test packages/renderer`, `bun run typecheck`, `bun run lint` and `bun run docs:check` pass.

## Docs checklist

- [ ] The STATUS row and the journal `docs/journal/419-polish-after-416-417.md`, with screenshots.

## Log

- 2026-11-08 — Created by the coordinator after reviewing the 416 and 417 screenshots.
