---
id: 054
title: "Light shafts through the clouds and an ozone sky at the golden hour"
status: done
owner: "sky session (Claude, 2026-10-17)"
depends: [037]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 054 — Light shafts through the clouds and an ozone sky at the golden hour

## Goal

Crepuscular rays when a low sun is behind or between cumulus, and the blue-hour colour of a sky with an ozone layer, both as stated in the draft of plan 037 and pushed out of it. Ready to show a stranger: a twilight that is violet and not olive, a low sun whose haze carries the clouds' shadows.

## Context

- Plan 037 and ADR 0059 (the cumulus slab, whose coverage the shafts follow); ADR 0027, 0037, 0053 (and its amendment: `medium` at most 13.3 ms, `high` at most 16.7 ms sync on the M5), ADR 0055 (preset switches), ADR 0064 (half-resolution rung); journals 027, 037, 039, 050.
- `atmosphere-model.ts`, `shaders/atmosphere.glsl.ts`, `shaders/sky-env.glsl.ts`, `sun-depth-table.ts`, `planet.ts`, `shaders/planet.glsl.ts`, `presets.ts`.
- Verified 2026-10-17 (`docs/research/three.md`, "Plan 054"): the ozone tent and cross sections (Bruneton's reference implementation, Hillaire's coefficients), the share of the twilight blue that is ozone absorption, crepuscular rays by screen-space radial blur (GPU Gems 3) against occlusion in the single-scattering march, aurora rendering.

## Scope

**In:**

1. Ozone absorption layer (tent, 10 to 40 km, Bruneton/Hillaire coefficients scaled for the home body) in the atmosphere model, its CPU twin, the sun-depth table and both shaders (ADR 0069).
2. Light shafts: a second march of 0 / 4 / 8 samples (low / medium / high) that removes the Mie in-scatter of samples under the cumulus slab, reading a baked cloud-coverage map; faded with the sun's elevation and the camera's altitude (ADR 0070).

**Out:** the aurora (draft 061), ridge-cast shafts and a cloud-shadow map for `medium` (draft 062), terrain (031), water (038), the cumulus itself (037).

## Design

See ADR 0069 and 0070. The pure twins are `atmosphere-model.ts` (`OZONE`, `ozoneDensity`, `extinction`, `mieRadiance`) and `light-shaft.ts` (`shaftOcclusion`, `shaftStrength`, `shaftDeficit`, `applyShaftLoss`, `cloudMapUV`).

## Steps

1. Refine: verify the coefficients online, decide the shaft technique by measuring, record ADRs. (done)
2. Pure maths and tests (ozone extinction, shaft weights, the application of the loss, the map addressing).
3. Shader, bake, presets; screenshots at golden hour; frame times against ADR 0053's amendment; hitch.
4. Full suites and docs.

## Acceptance criteria

- [x] **Ozone tested**: `bun test packages/renderer` has tests for the tent, the coefficients (Hillaire's three numbers), the vertical column (tent area times absorption), the loss of green at the horizon sun (0.6 to 0.75 of the no-ozone value), the twilight zenith's blue to green ratio at least 1.4 times the no-ozone ratio at -2 to -8 degrees, "only absorbs" and "a path under 10 km sees none", and the table's ozone channel against the fine integral. The ADR 0037 haze tests pass unchanged.
- [x] **Shaft weights tested**: occlusion, height weight, distance weight, strength gate, the deficit twin (zero with no occlusion, the whole Mie in-scatter with full occlusion within 10 percent, linear, additive over distance, step-count agreement within 12 percent, the Mie lobe's confinement to the sun's side), the application of the loss (ordered snapshots, at most `maxShare` removed), the map addressing.
- [x] **Screenshots** `[manual]` in `docs/journal/assets/054-before-*.jpg` and `054-after-*.jpg` (1920 x 1080, `high`): sunset at the pad (sun 6 degrees), twilight (sun -1.5 degrees, looking away from it), shafts with the sun among cumulus at two elevations (24 and 12 degrees), the terminator from 100 km, the pad at noon (unchanged); and `054-after-shaftlow-half.jpg` at the half-resolution rung. A written look review is in the journal.
- [x] **Frame budget** (journal 050's method: production build, hidden pane, 1920 x 1080 at ratio 1, minimum of 12 windows of 8 frames, sync = mean of 8 single frames, programs warm from a second page load): `high` at most 16.7 ms and `medium` at most 13.3 ms at the pad, 3 km, 12 km, orbit and the hillside (two views), against a baseline measured the same hour; table in the journal. The half rung still works.
- [x] **Hitch**: the nine preset switches of journal 037's protocol (page loaded, precompile finished) are not worse than the baseline build measured the same hour: worst frame 57 ms against 52 ms, the same 29 to 57 ms range; switching before the precompile finishes (84 s on both builds, so the protocol's 90 s is borderline) shows outliers of 300 to 600 ms on either build.
- [x] `bun test packages/renderer`, `bun run test`, web vitest, `bun run typecheck`, `bun run build`, `bun run docs:check` pass; prettier clean.

## Docs checklist

- [x] STATUS, journal 054, ADRs 0069 and 0070, `docs/research/three.md`, draft plans 061 and 062 for what is pushed out. The public roadmap has no entry for 054 (checked: nothing to remove).

## Log

- 2026-10-17 — Created as draft by the clouds session (pushed out of plan 037: the shafts need the cloud occlusion inside the atmosphere march or a second pass; the ozone layer changes the atmosphere model, its CPU twin and the sky-env pass, so it needs its own review of the sky colour).
- 2026-10-17 — Refined draft → ready at the human's request (session: sky session). Criteria made measurable; aurora pushed out to draft 061; the technique decided by measuring (ADR 0070).
- 2026-10-17 — Started (sky session). Per-sample noise evaluation measured at +5.8 ms on `high` facing the sun: replaced by a baked coverage map (+1.7 to 2.4 ms).
- 2026-10-17 — Executed (sky session). Criteria: see journal 054. Ozone: twilight olive green to violet; shafts: shadowed haze wedges around a low sun (subtle with cover 0.42). `high` worst 14.27 ms, `medium` worst 12.26 ms sync.
