---
id: 059
title: "Hills terrain on a body other than the first"
status: draft
owner: ""
depends: [052]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 059 — Hills terrain on a body other than the first

## Goal

A mod's second planet with `terrain: { kind: 'hills' }` is drawn with the hills the sim stands vessels on, not as a plain sphere.

## Context

- Found, not done, in plan 052 (ADR 0067 point 4): the planet pass (`PlanetPass`, ADR 0027) is built for the first body only (its atmosphere, clouds, the launch site at latitude 0, longitude 0 and `TerrainField` baked by `terrain-model.ts`); a later body with `hills` is a plain lit sphere in the renderer while `createBodyTerrainField` gives the sim the hills, so a lander would stand on ground the picture does not show.

## Scope

**In (to be ordered at refinement):** either a moon-pass-like mesh pass for the ridged `hills` function with its GLSL twin (`terrain-model.ts` and `shaders/terrain.glsl.ts` already have the twin), or a second planet pass instance with its own bake; the hills' launch site is a flat zone at latitude 0, longitude 0 which a second planet's landing site would also need (a `site` parameter on the kind).
**Out:** atmospheres on later bodies (the planet pass's own plan), clouds.

## Acceptance criteria

- [ ] To be made measurable at refinement (a scene with two bodies with hills draws both, readback parity as `readPatch`, frame budget).

## Docs checklist

- [ ] STATUS, journal, ADR, `writing-a-mod.md`.

## Log

- 2026-10-17 — Created as draft by plan 052 (found, not done).
