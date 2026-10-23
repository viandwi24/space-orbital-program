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

## Not done

- **The compute FFT on WebGPU**: the pass that runs the kernel above on the GPU, the normal and foam textures it writes and their binding (the planet pass is at its sampled-texture limit, journal 364, so they must be packed), and the foam from the Jacobian. `ocean-fft.ts` is the reference it will be checked against.
- **The WebGL2 reflection** still uses `uSkyColour` (the reduced sky march is not written), and the **cloud term** in the reflection.
- No "before" captures, no frame-time comparison against plan 392's baseline, no low-end runs, no sunset or orbit views, and no test for the planet pass's texture-binding count (the changes add none).
- The owner's look at the sea at noon, sunset and from orbit against reference image 04 ([manual]).
