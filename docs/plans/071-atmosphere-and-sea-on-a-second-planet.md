---
id: 071
title: "Atmosphere, sea and variety on a second hills planet"
status: in-progress
owner: "Agent 1"
depends: [059, 122]
phase: 3
created: 2026-10-17
updated: 2026-10-18
---

# 071 — Atmosphere, sea and variety on a second hills planet

## Goal

A mod's second planet is a place and not only a ground: with an `atmosphere` in its definition it has a sky, haze and a lit limb, its sea has the home planet's water, and two hills planets do not share one set of continents.

## Context

- Found, not done, in plan 059 (ADR 0090, points 4 to 6): the ground pass draws a hills body with the biome map's colours and no atmosphere, sea waves, clouds, launch-site buildings or terrain-cast shadows; the sky on it is black whatever the definition says (the sim does give it drag); the biome map is one seed, and the flat landing grassland is at latitude 0, longitude 0.
- ADRs: [0121](../decisions/0121-second-hills-planet-terrain-spec-air-sea-shadows.md) (decisions of this plan)
- Read: ADRs 0027 (planet pass, one analytic atmosphere for the first body), 0058 (airless light), 0064, 0090; journals 019, 027, 059.
- Foundation (ADR 0103): with the Sun as root (plan 122) the home planet is no longer "the first body", and the planet pass is keyed to the home body. The real solar system pack (plan 124, which depends on this plan) needs skies on planets other than home (Mars, Venus) to look right, and in the 1:1 and rescaled variants the home planet itself is a later body of the tree.
- Foundation (ADR 0097): item 3's `site` option is replaced by the world's sites and flat-zone list (plan 084), not a per-body landing spot.

## Scope

**In:**
1. **One terrain spec** for a later hills body (ADR 0121 point 1): `terrain.hills.seed`, the default seed from the world and the body id, the site zones; the sim, the renderer's CPU field and the GPU bake agree (the bake's zone and shift uniforms were never set).
2. **Air** on a later body with `atmosphere`: aerial perspective in the moon pass, a sky shell for the sky and the limb, the environment's light, fog and exposure over that body; optical depth from `surfacePressure`.
3. **Sea** shading: Fresnel, glint and waves on the hills ground's water.
4. **Terrain-cast shadows** on a hills body's patches.

**Out:** clouds on a later body, a launch site's buildings on a later body (a base is a mod's work).

## Touches

- **Size:** L
- **Edits:** `packages/renderer/src/moon.ts`, `packages/renderer/src/shaders`, `packages/renderer/src/environment.ts`, `packages/renderer/src/atmosphere-model.ts`, `packages/renderer/src/scene.ts`, `packages/core/src/schemas.ts`, `packages/core/src/body-terrain.ts`, `apps/web/src/lib/sim-host.ts` and the render setup, `docs/guides/writing-a-mod.md`
- **Shared contracts:** SDK (`terrain.hills.seed`; additive), `Catalog.bodyTerrain`, `SceneConfig.bodyTerrain`

## Steps

1. ADR 0121; the terrain spec through core, sim, catalog and the moon pass, with the parity test.
2. Air: atmosphere uniforms per body, aerial perspective, the sky shell, the environment over the body.
3. Sea shading and hills shadows.
4. Screenshots and frame times (M5) with a test mod planet.

## Acceptance criteria

- [ ] Renderer test: a later hills body's CPU height equals the sim's field (`createBodyTerrainField` of the same world) at sample directions, flat zone included; two seeds give different heights; the bake materials carry the zone and shift uniforms.
- [ ] Renderer test: a later body with `atmosphere` gets the air programs and a sky shell, an airless one neither; the environment's sky ambient over it is not black; optical depth scales with surface pressure (home unchanged).
- [ ] Browser (M5): a mod planet with an atmosphere shows a sky at its surface and a lit limb from orbit; two seeds differ; sea glint visible; the GPU bake matches the CPU field (patch readback, within 0.5 m); frame time on the body within ADR 0053's budget (`high` 14.4 ms).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] STATUS, journal, ADR, `writing-a-mod.md`.

## Log

- 2026-10-17 — Created as draft by plan 059 (found, not done).
- 2026-10-17 — Realigned with the owner's Fondasi Orbital decisions (ADR 0103, 0097: needed by the Sol pack; sites replace the per-body landing spot).
- 2026-10-18 — Claimed by Agent 1 and refined: ADR 0121; found while reading that the GPU bake, the CPU twin and the sim of a later hills body use three different seeds and zones (fixed by point 1).
