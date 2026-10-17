# 0070 — Light shafts: a second march that reads a baked cloud-coverage map

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/054-light-shafts-and-ozone-sky.md

## Context

Plan 037 left light shafts out: the atmosphere march lights every view sample with the full sun, so a cloud shadows the ground (plan 050's cloud shadows, `high` only) but not the haze. Two techniques were on the table (research `three.md`, "Plan 054"): a screen-space radial blur of the cloud mask toward the sun, and a cloud-occlusion term inside the march. Budget: `medium` at most 13.3 ms and `high` at most 16.7 ms sync on the M5 at five scenes (ADR 0053 amendment); the draft asked for about 1 ms at the pad.

## Decision

1. **Occlusion in the march, not a blur.** The blur needs a mask target the one-pass planet pass does not produce (the half-resolution rung of ADR 0064 would need it twice), only works with the sun on screen, and cannot put a beam in front of a cliff or a cloud; the march form works from any direction, at the half rung, and is the same quantity the atmosphere already integrates. A second march (`shaftLoss`) of `shaftSteps` samples (low 0, medium 4, high 8) over at most 40 km of the view ray, quadratically spaced, jittered; each sample under the slab loses the share of the sun the cumulus blocks where its sun ray crosses the slab (`shaftOcclusion`: coverage times optical depth 2 over the sun height, floor 0.12, 8 % leaks); it removes the Mie in-scatter that sample would have added (only Mie: the haze is where beams show, and its forward lobe keeps them on the sun's side of the sky; the sky's own blue fills the shadow). Only pixels within 75 degrees of the sun run it, and `shaftStrength` fades it out for a sun above 25 to 55 degrees, a sun under the horizon and a camera above 8 to 15 km.
2. **A baked coverage map, not the noise.** Evaluating the coverage field per sample (the first build: warp plus two octaves, 10 samples) cost +5.8 ms on `high` facing the sun and made the shaft count the budget. The coverage field (`cloudDensityQ`, now shared GLSL in `cloud-field.glsl.ts`, the same function the planet pass uses) is baked once into a 1024 x 512 R8 equirectangular map (3.7 km per texel at the equator, finer than the shadows it serves), 3 octaves, rotated by the clouds' drift at lookup, rebaked only when the cover changes and only while the preset has shafts (the first bake is on the first frame, so the program compiles with the rest). A sample is one texture fetch; cost fell to +1.7 to 2.4 ms on `high` (+0.5 to 1.5 on `medium`).
3. **Applied without breaking the cloud composite.** The loss is accumulated for the whole path and up to the two cloud snapshots, then subtracted segment by segment (`applyShaftLoss`), each segment losing at most 70 % of its own in-scatter: the composite of ADR 0037 subtracts neighbouring snapshots, and a clamp on the total alone made them cross and painted black wedges (seen and fixed in the build).
4. **An artistic gain of 1.5 on the removed haze.** The model's haze is thinner than a real dusk's aerosol, where beams read plainly; 1 is the physical amount (the test of the twin compares against the Mie in-scatter of the model), 1.5 is what the screenshots needed to show a wedge of shadow at all. It is a constant in `light-shaft.ts`.
5. **`medium` keeps 4 steps; `low` none.** `medium` stays inside 13.3 ms at all five scenes with them (measured worst 12.26); `low` has no post chain and the least headroom.
6. **The terrain does not cast shafts.** A ridge shadow per sample would need the terrain-shadow march per sample (eight height reads each): not attempted; the massif shows only through cloud shadows on its slopes (draft 062).

## Alternatives considered

- **Screen-space radial blur of the cloud mask:** above.
- **Per-sample noise evaluation:** measured, over budget; kept as the CPU twin's semantics, replaced on the GPU by the map.
- **A cloud-shadow map for the ground as well (draft 056):** shares the bake infrastructure and would let `medium` have ground shadows; not in this plan.
- **Aurora:** the plan's optional item; out of scope here (draft 061).

## Consequences

- Beams are subtle with the home body's scattered cumulus (cover 0.42): they show as a lit wedge beside a darker one around a low sun and as shadowed haze under a cloud mass, not as many thin rays. Denser cloud decks would show more (journal 054).
- One more 0.5 MB texture and one fullscreen bake per page load; a change of cloud cover rebakes it (nothing changes it today).
- `bakeTerrain` now renders once more on the first frame (the cloud map); `preset-switch.test.ts` pins that preset switches never bake it again.
