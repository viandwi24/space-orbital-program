# 0037 — Haze by thicker air, two cloud layers in one march, moving waves

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/027-terrain-and-sky-follow-ups.md

## Context

Journal 025: land at 3 to 10 km looks "milky", the sky has one blurred cloud shell, and the sea is a still normal map. The first suspect for the milk was the multiple-scattering stand-in `skyBoost` (2.2) applied to every path. Measured with the pure twin (`aerialPerspective`): for a 10 km slant path over dark ground (albedo 0.1) at 3, 6 and 10 km altitude the veil radiance was 0.91, 0.70 and 0.72 of the ground's own radiance, and it is **Rayleigh**, not Mie, that dominates (halving the Mie boost moved it by 3 %). The vertical optical depth (blue 0.265) is what colours the sky; the horizontal density near the ground is only an artefact of squeezing it into the body's 5.6 km pressure scale height.

## Decision

1. **Haze: the scattering layer is twice as thick as the pressure scale height with half the sea-level density** (`RAYLEIGH_THICKNESS = 2`: Rayleigh scale height 11.2 km, `beta` halved). The vertical depth is unchanged, so zenith radiance and sunset reddening stay within 5 % (tested), while horizontal paths near the ground are half as dense: the 10 km veil drops to 0.55, 0.45 and 0.51 of the ground (tested at most 0.6). `mieBoost` is split from `skyBoost` in the march (Rayleigh and Mie are accumulated separately) so haze can be tuned alone; both stay 2.2. The GPU march and the CPU twin share the change; the pressure scale height of the body (drag, heating) is untouched.
2. **Cloud layers**: a table (`cloud-model.ts`) of two thin shells, cumulus at 3.5 km (reworked) and cirrus at 9.5 km. One atmosphere march is snapshotted at the distances of **two** shells (`tcA <= tcB`), the nearer layer first; the composite `S1 + a1 T1 c1 + (1 - a1)(S2 - S1 + a2 T2 c2 + (1 - a2)(Send - S2 + Tend base))` is the twin of `compositeLayers` and is tested (alpha 0 equals the cloud-free colour, an opaque near layer hides everything behind it, unhit layers telescope). Any number of layers is one march.
3. **Cumulus**: soft body edges that sharpen with a small pixel footprint, puffs and billows (octaves faded out by the footprint of a pixel on the shell, so grazing views do not alias), opacity `1 - exp(-density)` instead of a clamp, a self-shadow sample toward the sun at a distance that follows the footprint, darker undersides when seen from below, silver edges, distance fade. **Cirrus**: streaks stretched along the wind, thin (opacity at most 0.42), lit with strong forward scattering. Ground shadows stay on the cumulus only (they use the cheap density).
4. **Water**: seven deep-water wave components (`water-model.ts`, 120 m to 1.1 m) with `omega` from the dispersion relation rounded to a whole number of cycles per 180 s, so the sea is periodic and `uTime` is wrapped on the CPU; the shader sums plane waves along the site's east/north axes with the anchor phase computed in float64, fades components shorter than three pixels, modulates the gains with a slow noise and warps the phase so a few plane waves do not band, and adds crest foam by height and steepness. Existing shore foam, glint and Fresnel are unchanged. River flow and lakes are not done (draft plan 031).
5. **Cost**: clouds were the largest new cost at the pad (2.4 ms with both layers, 0.8 ms of it cirrus). Octaves of detail are skipped when faded out, the warp uses one three-value noise (`noiseF3`: one pcg3d per lattice corner serves a vec3) and the shade sample is skipped for thin cloud. `high` also gives up 4 view and 1 light sample and 2 ground octaves (visually equal on the shots) to stay inside plan 025's pad budget.

## Alternatives considered

- **Lowering `skyBoost` or the Mie coefficient**: changes the sky colour and the sun glow, which are right.
- **A per-ray "clarity" factor for ground paths only**: discontinuous at the horizon between sky and ground.
- **Volumetric ray-marched clouds (Schneider / Horizon-style)**: 16+ samples per pixel; far over the pad budget, kept for a later plan with a half-resolution pass.
- **A cubemap of precomputed clouds**: static, no parallax, and the shell needs per-pixel footprint detail.

## Consequences

- The atmosphere uniforms gain `uMieBoost`; the sky-env pass (image-based light) uses the same GLSL and so shares the thicker layer.
- The cumulus still reads as a flat deck with soft shading, not volume (journal 027, self-review); volumetric lighting is out of this plan.
- Known artefact of the measurement setup: in the hidden browser pane a program compiled after the first frame ran about 3x slower until the page was reloaded with the shader cached (journal 027, "Surprises").
