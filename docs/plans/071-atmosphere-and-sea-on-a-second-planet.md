---
id: 071
title: "Atmosphere, sea and variety on a second hills planet"
status: draft
owner: ""
depends: [059, 122]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 071 — Atmosphere, sea and variety on a second hills planet

## Goal

A mod's second planet is a place and not only a ground: with an `atmosphere` in its definition it has a sky, haze and a lit limb, its sea has the home planet's water, and two hills planets do not share one set of continents.

## Context

- Found, not done, in plan 059 (ADR 0090, points 4 to 6): the ground pass draws a hills body with the biome map's colours and no atmosphere, sea waves, clouds, launch-site buildings or terrain-cast shadows; the sky on it is black whatever the definition says (the sim does give it drag); the biome map is one seed, and the flat landing grassland is at latitude 0, longitude 0.
- Read: ADRs 0027 (planet pass, one analytic atmosphere for the first body), 0058 (airless light), 0064, 0090; journals 019, 027, 059.
- Foundation (ADR 0103): with the Sun as root (plan 122) the home planet is no longer "the first body", and the planet pass is keyed to the home body. The real solar system pack (plan 124, which depends on this plan) needs skies on planets other than home (Mars, Venus) to look right, and in the 1:1 and rescaled variants the home planet itself is a later body of the tree.
- Foundation (ADR 0097): item 3's `site` option is replaced by the world's sites and flat-zone list (plan 084), not a per-body landing spot.

## Scope

**In (to be ordered at refinement):**
1. **Atmosphere on a later body**: the planet pass's sky and ray march for a body other than the first (a second instance with a low budget, or the atmosphere ray march as a mesh-pass shell), the camera's exposure and fog on it, the horizon of a hills body seen from its surface.
2. **Sea**: water shading (Fresnel, glint, waves) for the ground pass's ocean and lakes, not a flat blue.
3. **Variety**: `terrain.hills` options `seed` (a different biome map and noise salts, as `craters.seed`) and `site` (the flat landing grassland at a latitude and longitude, the placement default of `load-vessel`), additive API change with `writing-a-mod.md`.
4. **Terrain-cast shadows** on a hills body (the march of ADR 0068 with a slope bound of 1).

**Out:** clouds on a later body, a launch site's buildings on a later body (a base is a mod's work).

**Realignment (2026-10-17):** item 1 must work for any body of the tree that is not the home body, after plan 122; item 3 keeps `seed` (per body) and drops `site` in favour of plan 084's flat zones; the frame budget is taken in the Sol pack's rescaled variant too when it exists.

## Touches

- **Size:** L
- **Edits:** `packages/renderer/src/planet.ts`, `packages/renderer/src/moon.ts`, `packages/renderer/src/shaders`, `packages/core/src/terrain.ts`, `docs/guides/writing-a-mod.md`
- **Shared contracts:** SDK (`terrain.hills.seed`; additive)

## Acceptance criteria

- [ ] To be made measurable at refinement (a mod planet with an atmosphere shows a sky at its surface and a lit limb from orbit; two seeds differ; frame budget as 059).

## Docs checklist

- [ ] STATUS, journal, ADR, `writing-a-mod.md`.

## Log

- 2026-10-17 — Created as draft by plan 059 (found, not done).
- 2026-10-17 — Realigned with the owner's Fondasi Orbital decisions (ADR 0103, 0097: needed by the Sol pack; sites replace the per-body landing spot).
