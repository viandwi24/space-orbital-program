---
id: 050
title: "Half-resolution planet pass and cloud shadows on medium"
status: draft
owner: ""
depends: [048]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 050 — Half-resolution planet pass

## Goal

The flight view holds its frame budget on GPUs slower than the Apple M5 the presets were tuned on (M1/M2 and Intel are the ADR 0025 budget machines, none was available to plan 039).

## Context

- Split out of plan 048 at its refinement. ADR 0053 (alternatives: the half-resolution pass needs a float depth target next to the colour one so the vessel meets the ground at full precision, and it softens the pad markings and the grass); journal 039.
- `medium` met its target by cutting cloud and ground octaves, so the largest possible saving (3 of 4 pixels of the planet pass) was not needed on the M5.

## Scope

**In (candidates, to be ordered at refinement):**
1. Half-resolution planet pass with a depth-aware upsample (bilateral on the log depth), as a governor rung between `high` at 0.7 and `medium`, or for `low`; the near ground (inside the flat site zone) stays at full resolution if the softening shows. One ADR.
2. Cloud shadows on `medium`: `CLOUD_SHADOWS` is tied to four cloud octaves (`definesFor`); a separate flag gives `medium` the shadows back if the pass pays for them.
3. Measurements on M1/M2, Intel and a phone-class GPU if hardware is available (draft 038 holds the same item).

## Steps

1. Refine: measure on a slower GPU first (or with the render scale at 0.5 as a stand-in), then pick and order.

## Acceptance criteria

- [ ] To be written at refinement. Must include: frame times at the five scenes of journal 039 on a slower GPU; a visual comparison of the pad and the hillside at full and half resolution.

## Docs checklist

- [ ] STATUS, journal, ADR.

## Log

- 2026-10-17 — Split out of plan 048 (refinement by the switch session).
