# 0059 — The cumulus as a short ray-marched slab, inside the old budget

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/037-volumetric-clouds-and-light-shafts.md

## Context

ADR 0037 made the cumulus a thin shell lit by one shade sample: it reads as a paper deck (journals 027, 031, 039). The budget is fixed (ADR 0053 amendment): `medium` at most 13.3 ms and `high` at most 16.7 ms sync on the Apple M5 at the pad, 3 km, 12 km, orbit and the hillside; plan 039 measured `high` 14.4 and `medium` 13.3 at the worst scenes, so the new look has to cost about what the shell cost.

Verified 2026-10-17 (research `three.md`, "Plan 037"): the Horizon Zero Dawn system targets about 2 ms with a noise-based density, a light march and a phase function; Toft et al. reach a similar picture with 8 steps instead of 128 by a jittered start, analytic integration of each step and, optionally, temporal anti-aliasing of a low-resolution cloud buffer.

## Decision

1. **A slab, not a volume texture.** The cumulus occupies the shell between 3 500 m and 4 600 m. The 2D coverage of ADR 0037 (`cloudDensity`, evaluated once per pixel at the middle of the marched stretch, then shaped by `coverShape`) says where there is cloud; the marched part only adds depth: a height profile (flat, ragged base; top that rises with the coverage) and billow erosion (up to three octaves of value noise at 210, 70 and 25 m, each faded out by the pixel footprint).
2. **3 to 6 steps, only where there is cloud.** `cloudSteps` (low 3, medium 4, high 6) steps of at most 3 000 m of the ray inside the slab; a pixel whose coverage is under 0.004 does no march at all (the cost of clear sky is below the old shell's). Extinction is integrated analytically per step, so the opacity does not depend on the step count (tested). A grazing path adds at most 3 000 m more of optical depth at the average density (clouds are finite).
3. **Light without a light march.** Sun optical depth at a sample = three evaluations of the height profile (analytic, no noise) plus one detail sample 450 m toward the sun; a dual-lobe Henyey-Greenstein phase through three multiple-scattering octaves (Wrenninge), capped at 1.6 times isotropic; a powder term, a diffuse fill, a cavity shade from the erosion noise, ambient that grows with height; the radiance is rolled off at 3 so a sun-lit top near the sun does not bloom over the frame (measured: unclamped it washed the whole 3 km view white). The result is one opacity and one mean radiance per pixel, so the composite of ADR 0037 (`S1 + a1 T1 l1 + (1 - a1) ...`) and the single atmosphere march are unchanged. The snapshot distance of the atmosphere march is the middle of the marched stretch.
4. **Presets.** `cloudSteps` and `cloudDetail` (1 to 3 octaves) join `cloudOctaves` in the table; both are compile-time defines, so a preset switch uses the programs `precompile` already builds.
5. **Not adopted: temporal reprojection and a half-resolution cloud buffer.** The planet pass is one full-resolution pass with no history buffer and no cloud target; adding either is plan 050's job (half-resolution planet pass). Instead the start of the march is jittered by a quarter of a step (interleaved gradient noise, the same used by the atmosphere march) and the integration is analytic, which keeps the grain at the cloud edges small enough for the bloom to hide.
6. **Pure twin.** `cloud-volume.ts` holds the constants the shader imports and the maths that can be tested without a GPU (profile, density, coverage shape, erosion, phase, multiple scattering, fill, roll-off, sun depth, slab interval, analytic march, jitter).

## Alternatives considered

- **A 3D noise texture (Schneider's Perlin-Worley volumes):** needs a baked 128^3 texture and a second one for erosion, texture bandwidth in the same pass as the terrain march, and the baking work in the preset switch (ADR 0055); procedural value noise at 3 to 6 steps was cheaper to try and held the budget.
- **A half-resolution cloud pass with reprojection (the draft's first idea):** the right structure for slower GPUs, a new render target, an upsample that respects the depth edges and a history buffer; plan 050 already covers the pass. Not needed for the M5's budget.
- **Light march of 3 to 4 samples toward the sun:** each sample needs the coverage and the erosion again; the analytic profile depth plus one detail sample costs a quarter and was enough for dark bases with bright rims.
- **Keeping the shell and only improving its shade:** the previous plan's last resort; the slab brings the ragged base and the rim light, the things the reviews asked for.

## Consequences

- The cloud stage costs 0.7 to 1.5 ms at the five scenes on both presets; on `high` it costs up to 7 ms when the whole view is cloudy sky (hillside, looking away from the terrain), still inside the 16.7 ms budget, and not measured on M1/M2 or Intel (drafts 038, 050).
- The ground cloud shadows still read the 2D coverage at the base altitude, so a shadow and its cloud differ by the slab's parallax (up to about a kilometre at a low sun).
- The macro shapes of the clouds still come from the 2D coverage field: the slab gives volume to what a cloud looks like inside and underneath, not new cloud silhouettes (journal 037).
- Light shafts and the aurora/ozone term are draft plan 054.
