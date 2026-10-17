---
id: 062
title: "Light shafts from mountains and a cloud-shadow map for medium"
status: draft
owner: ""
depends: [054, 056]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 062 — Terrain shafts and shared cloud-shadow map

## Goal

A sun low behind a ridge throws beams across the haze, and the baked cloud-coverage map of plan 054 also serves the ground's cloud shadows on `medium` (draft 056's idea).

## Context

- Found, not done, in plan 054 (ADR 0070 point 6): the shafts only know cloud shadows; ridge shadows per sample need the terrain-shadow march (eight height reads each) or a coarse sun-space shadow map of the terrain.
- The coverage map (`planet.ts` `bakeCloudMap`, `light-shaft.ts` `cloudMapUV`) is the piece draft 056 asked for; `medium`'s `cloudShadowOctaves` is 0 because the per-pixel noise cost +1.0 ms (journal 050).

## Scope

**In (to be ordered at refinement):** measure a per-sample terrain-shadow read against a baked horizon map; use the existing map for `CLOUD_SHADOWS` on `medium`.
**Out:** the aurora (061).

## Acceptance criteria

- [ ] To be made measurable at refinement (frame table on `medium` and `high`; screenshots of a ridge against a low sun).

## Docs checklist

- [ ] STATUS, journal, ADR.

## Log

- 2026-10-17 — Created as draft by plan 054 (found, not done).
