# 401 — Ocean v2

**Plan:** [plans/401-ocean-v2.md](../plans/401-ocean-v2.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0330](../decisions/0330-graphics-v2-120hz-built-in-looks-mod-data.md) point 3

## What was done

| Where | What |
|---|---|
| `renderer/tsl/planet-pass.ts` | the sea's reflection reads the sky-view table in the reflected direction (`sky.inscatter(ro, reflect(rd, n))`, the normal turned to the inertial frame) in place of the one mean `uSkyColour`; Fresnel and the Toksvig-widened glint are as they were |
| `renderer/tsl/water.ts`, `water-model.ts` | Medium and up add two scrolled detail layers to the wave gradient (1.7 m and 0.55 m, drifting in their own directions, the slope of a value noise); each fades out like a wave from three pixels a wavelength (`detailFade`). Procedural, so no new texture binding |
| `renderer/ocean-fft.ts` | the CPU reference of the 64² FFT: a Phillips spectrum from the wind (`phillips`, `initialSpectrum` with a seeded random phase, so its energy is the spectrum's exactly), evolution by the deep-water dispersion, a radix-2 2D inverse FFT; `test/ocean-fft.test.ts` pins determinism, the energy against `expectedEnergy` within 5 %, and that a single mode comes back as that mode |
| `presets.ts` | `ocean: 'low' | 'medium' | 'high'` in the planet pass's variant key (Low the analytic sea with the LUT reflection; Medium adds the detail; High is the level the FFT will take) |

## Seen in the browser (WebGPU, Chrome, `high`)

[the sea from 150 m](assets/401-sea-after.jpg) with the reflected sky and [from 25 m](assets/401-sea-detail.jpg) with the detail ripples. No bundling or pipeline errors beyond the shadow-texture message that is already on main.

## Second part (after plan 393 landed)

| Where | What |
|---|---|
| `renderer/tsl/ocean-fft.ts` | the sea's 64² FFT on the GPU at High: the spectrum of `ocean-fft.ts` (normalised to an RMS slope of 0.16) evolved in time and inverse transformed by a separable direct transform in three fragment passes (two row passes into float targets, one column pass into a tiling half-float texture of height, slope x, slope z and foam), the pattern of the sky tables. A fragment pass, not a compute shader, so it needs no new API and also runs on the WebGL2 backend of the TSL pass; every second frame; the sea reads it at a 200 m tile, faded out from a footprint of 6 to 30 m |
| `shaders/atmosphere.glsl.ts`, `planet.glsl.ts` | WebGL2: the sea's reflection is `skyReflection`, a six-sample march of the air in the reflected direction, in place of the mean colour |
| both passes | a cheap cloud term: the 2D cloud map where the reflected ray meets the cloud layer, mixed into the reflection (where the preset has the map) |

Seen in the browser: [the sea at High with the FFT](assets/401-sea-fft.jpg) (WebGPU, 30 m up: larger swell with the fine ripples on it) and [the same view on WebGL2](assets/401-sea-webgl.jpg) with the new reflection. At High the whole GPU frame read 1.9 ms with the FFT running, well inside the 7 ms budget (the FFT passes are not separately labelled in the pass timings). No new texture-binding or pipeline errors appeared (one extra sampled texture at High).

## Not done

- **The foam is the slope's steepness**, not the displacement Jacobian: there is no displacement field.
- **No "before" captures**, no frame-time comparison against plan 392's baseline across the views, no low-end or sunset or orbit runs, no test for the planet pass's sampled-texture count (the pass adds one texture at High).
- The cloud term was compiled but not looked at: the checked views had no clouds in the reflection.
- The owner's look at the sea at noon, sunset and from orbit against reference image 04 ([manual]).
