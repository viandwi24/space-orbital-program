---
id: 048
title: "Half-resolution planet pass and cheaper preset switches"
status: draft
owner: ""
depends: [039]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 048 — Half-resolution planet pass and cheaper preset switches

## Goal

The flight view holds its frame budget on GPUs slower than the Apple M5 the presets were tuned on (M1/M2 and Intel are the ADR 0025 budget machines, none was available to plan 039), and switching preset does not hitch.

## Context

- Plan 039 and ADR 0053 (the governor, the march prepass, the amendment with the reviewed budget: `medium` at most 13.3 ms and `high` at most 16.7 ms sync on an M5), journal 039 (frame tables, the hitch table and its measured reasons).
- Why it was not in 039: `medium` met its target by cutting cloud and ground octaves, so the largest possible saving (3 of 4 pixels of the planet pass) was not needed on the M5; it would soften the pad markings and the grass that make the near ground, and needs a float depth target next to the colour one so the vessel meets the ground at full precision (ADR 0053, alternatives).

## Scope

**In (candidates, to be ordered at refinement):**
1. **Half-resolution planet pass** with a depth-aware upsample (bilateral on the log depth), used by the governor as a rung between `high` at 0.7 and `medium`, or by `low`; one ADR; the near ground (inside the flat site zone, where the pad and the grass are) stays at full resolution if the softening shows.
2. **Cheaper preset switches**: the worst switch costs 130 to 290 ms (journal 039): `SiteGroup.setTrees` regenerates the instanced trees and tufts on every switch (48 to 207 ms) and the first frame re-bakes the terrain cube and patches when `terrainSize` or `terrainPatch` change (40 to 130 ms). Keep the vegetation per preset or rebuild it over several frames, and spread the bake.
3. **Measurements on M1/M2, Intel and a phone-class GPU** if hardware is available (draft 038 holds the same item).
4. **Cloud shadows on `medium`**: `CLOUD_SHADOWS` is tied to four cloud octaves (`definesFor`); a separate flag would give `medium` the shadows back if the half-resolution pass pays for them.

## Steps

1. Refine: measure on a slower GPU first (or with the render scale at 0.5 as a stand-in), then pick and order.

## Acceptance criteria

- [ ] To be written at refinement. Must include: frame times at the five scenes of journal 039 on a slower GPU; the longest frame in the 2 s after `setPreset` at most 4x the steady frame; a visual comparison of the pad and the hillside at full and half resolution.

## Docs checklist

- [ ] STATUS, journal, ADR.

## Log

- 2026-10-17 — Created as draft by the plan 039 completion session (the orchestrator review asked for the half-resolution pass as a post-v1 draft unless `medium` could not meet its target without it).
- 2026-10-17 — Orchestrator review of plan 039: the preset-switch hitch (130–290 ms; vegetation rebuild and terrain re-bake) is a v1 must-ship item here, because the quality governor can switch presets mid-flight. The half-resolution planet pass stays optional for v1.
