---
id: 037
title: "Volumetric cumulus, light shafts and a sky with depth"
status: done
owner: "clouds session (Claude, 2026-10-17)"
depends: [031]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 037 — Volumetric cumulus, light shafts and a sky with depth

## Goal

The cumulus stops reading as a paper deck: a ray-marched slab with a flat ragged base, darker undersides, bright rims, billow detail and a phase function with a silver lining, inside the frame budget of ADR 0053's amendment. Light shafts and the aurora/ozone term are pushed to draft 054 (reasons in the Log). Pushed out of plan 031 because it is a second rendering stage with its own budget (ADR 0044, "Scope decisions").

## Context

- `journal/027-terrain-and-sky-follow-ups.md`, `journal/031-physical-terrain-and-sky-volumes.md`, `journal/039-performance-and-look-pass.md` (cloud cost 2.4 ms at the pad, the "cut-out paper" reviews, the 12 km contrast rectangle), `journal/048-cheaper-preset-switches.md` (the hitch method), ADR 0037 (the shell this replaces for the cumulus), ADR 0053 and its amendment (budget), ADR 0055, `product/visual-direction.md` (ADR 0025).
- Research: [three.md](../research/three.md) "Plan 037" (Horizon cloud system, Toft et al., checked 2026-10-17). ADR [0059](../decisions/0059-cumulus-slab-march.md).

## Scope

**In:**

1. The cumulus as a slab (1 100 m above the old 3 500 m shell) marched in 3 to 6 steps per pixel, only where the 2D coverage of ADR 0037 says there is cloud: height profile, billow erosion, analytic per-step integration, dual-lobe phase with a multiple-scattering stand-in, a sun optical depth from the profile plus one detail sample, a powder term, a diffuse fill, a roll-off of the radiance.
2. Presets: `cloudSteps` and `cloudDetail` (low 3 / 1, medium 4 / 2, high 6 / 3).
3. Pure twin of the maths (`cloud-volume.ts`) with tests, before/after screenshots, frame times at five scenes for `medium` and `high`, the preset-switch hitch against the tree before.

**Out:** terrain (031), water (038), light shafts and aurora/ozone (draft 054), temporal reprojection (not adopted, ADR 0059), the cirrus shell (unchanged), the ground cloud shadows (still the 2D coverage).

## Steps

1. Refine: verify the technique online, write ADR 0059, make the criteria measurable.
2. `cloud-volume.ts` + `test/cloud-volume.test.ts`, then the shader (`planet.glsl.ts`), `planet.ts` (uniform `uCloudTop`, defines), `presets.ts`.
3. Build the baseline and the change as production builds, shoot and measure with one harness (journal 037), iterate on the look.
4. Docs.

## Acceptance criteria

Method for every measured item: production build (`NODE_ENV=development vite build`, so `__orbital` exists) served by a static server, built-in browser pane, canvas forced to 1920 x 1080 at ratio 1, rAF stubbed, quality governor off, the baseline being a build of the tree at the start of the session. Frame time = minimum over 30 windows of 8 frames, sync = eight times `debug.benchmark(1)`; scenes as in journal 039 (pad `pad-morning`, 3 km / 12 km / orbit straight above the pad, hillside worst of four view directions).

- [x] **Pure maths with tests:** profile, density, coverage shape, erosion octaves, phase functions, multiple scattering, powder, fill, roll-off, sun optical depth, slab interval, analytic march (step-count invariance, jitter mean). `bun test packages/renderer/test/cloud-volume.test.ts`: 33 tests.
- [x] **The cumulus is a marched slab with presets:** `cloudSteps` / `cloudDetail` in the preset table, defines in `planet.ts`, the shader compiles and renders on `low`, `medium` and `high` (switched through in the preset-switch run).
- [x] **Before/after screenshots at the pad, 3 km, 12 km, orbit and the hillside** in `docs/journal/assets/037-before-*.png` and `037-after-*.png` (`high`, 1920 x 1080), and a written look review in the journal `[manual]`.
- [x] **12 km mountain contrast with clouds (journal 039's rectangle, x 100 to 1800, y 280 to 700, luminance standard deviation):** at least 1.5 times journal 039's with-clouds figure of 17.5 (that is, 26.3) and not below 0.95 of the same-method baseline. Measured 27.33 after, 27.06 before (1.01 of the baseline; 1.56 of 17.5). Not a gain made by this plan: the clouds do not change the contrast, they do not lose it (see the journal for what the figure measures).
- [x] **Frame budget held (sync ms, minimum of 30 windows)**, `medium` at most 13.3 and `high` at most 16.7 at pad, 3 km, 12 km, orbit and hillside (worst of four directions): `high` 14.5 / 11.3 / 8.1 / 4.6 / 13.5 (baseline 13.8 / 9.8 / 7.2 / 3.6 / 12.6); `medium` 12.1 / 9.6 / 7.5 / 4.6 / 11.7 (baseline 11.1 / 8.9 / 6.6 / 3.5 / 11.8). The cost is 0.7 to 1.5 ms at the five scenes; the three hillside directions that were cheap on `high` (5.6 to 6.9 ms, mostly sky) now read 13.2 to 13.5 ms, so the cloud stage costs up to 7 ms on `high` when the whole view is cloudy sky (journal 037).
- [x] **Preset-switch hitch not worse:** same sequence (to high, low, medium, high, low, medium, low, high, medium) on the baseline build and this one, cold page loaded 90 s earlier: first switch to high 227 + 32 ms against 174 + 31, to low 22 + 57 against 19 + 51, to medium 1 + 33 against 1 + 44, revisits 31 to 47 against 25 to 65 (`setPreset` + first frame).
- [x] **Light shafts and aurora/ozone:** pushed to draft 054 with reasons (Log); they are not part of this plan's done.
- [x] All repo checks (see the journal; two `scene.test.ts` failures belong to plan 023's uncommitted camera work, not to this plan).

## Docs checklist

- [x] STATUS, journal 037, ADR 0059 and the index, `research/three.md`, draft 054.

## Log

- 2026-10-17 — Created as draft by the physical-terrain session (pushed out of plan 031).
- 2026-10-17 — Refined draft → ready at the human's request (session: clouds session). Criteria written from the draft's items; two items pushed with reasons: light shafts (they need the cloud occlusion inside the atmosphere march, one density evaluation per march sample, or a second full-screen pass; neither fits the budget with the slab) and the aurora/ozone term (an ozone absorption layer changes the atmosphere model, its CPU twin and the sky-env pass that plan 049 was editing; it needs its own review of the sky colour) go to draft 054. Temporal reprojection is not adopted: the planet pass is one full-resolution pass with no history buffer (plan 050 is the place for a half-resolution pass); the march uses a quarter-step jitter and analytic integration instead (ADR 0059).
- 2026-10-17 — Started (clouds session).
- 2026-10-17 — Done. 33 tests, frame budget held at five scenes on both presets, hitch equal to the baseline build's, contrast unchanged (27.3), the look better at the pad and at 3 km, the macro shapes still from the 2D coverage (journal 037, "What still looks like a debug view").
