---
id: 056
title: "A baked cloud-shadow map for medium and sharper edges at the half-resolution rung"
status: draft
owner: ""
depends: [050]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 056 — Baked cloud-shadow map, sharper half-resolution edges

## Goal

Two things plan 050 measured and left open: (1) `medium` has no cloud shadows on the ground because evaluating the cloud density per ground pixel costs 1.0 to 1.2 ms (journal 050) and its hillside is at the 13.3 ms budget; (2) at the governor's half-resolution rung the cloud edges and ridge lines show 2 x 2 steps.

## Context

- Plan 050, ADR 0064, journal 050 (the cloud-shadow cost does not fall with fewer octaves: the domain warp and the first octave are the cost). ADR 0059 (the 2D coverage that the shadow reads).

## Scope

**In (candidates):**
1. A small baked map of the cloud density over the sphere (an equirectangular or cube texture at 256 to 512 texels), re-baked as `uCloudAngle` moves (about once per second), read by one texture fetch per ground pixel instead of about 24 hashes; if it costs under 0.3 ms on the M5 `medium` gets the shadows back (`cloudShadowOctaves` becomes a map size).
2. Sharper edges at the half rung: a one-pixel edge-aware reconstruction (for example choosing the texel by the gradient of the colour inside the nearest depth class), or temporal reprojection with a history buffer if one exists by then (draft 054 and ADR 0059 mention it).
3. M1/M2, Intel and a phone-class GPU measurements of the ladder (draft 038 holds the same item).

**Out:** a per-pixel full-resolution near ground inside the half pass (both passes would run); changing the default preset.

## Acceptance criteria

- [ ] To be written at refinement. Must include: the `medium` frame table at the five scenes with the shadows on (at most 13.3 ms sync on the M5), a before and after of the half rung's cloud edges.

## Docs checklist

- [ ] STATUS, journal, ADR.

## Log

- 2026-10-17 — Created as a draft by plan 050 (half-res session).
