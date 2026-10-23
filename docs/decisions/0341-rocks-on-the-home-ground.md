# 0341 — Rocks on the home ground: visual only, small, placed by cell

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/402-terrain-detail.md
**Builds on:** ADR 0068 (stones on craters bodies), ADR 0092 (stones the sim collides with), ADR 0306 (triplanar detail), ADR 0330 (graphics v2)

## Context

Away from the launch site the home planet's ground is bare. The moon has stones (ADR 0068, 0092): a body-fixed lattice, instanced, and collided by the sim from the same list. The plan asks for rocks on the home ground that never regenerate when the floating origin moves, with LODs, quality levels, and a decision: visual only, or collidable.

## Decision

1. **Visual only, and small.** A rock's radius is at most `SCATTER.sizeCut` = 0.4 m (its dome under 0.3 m): below what a landing leg or a wheel would feel. The sim does not know them, and a test holds every placed rock to the cut. No boulders on the home ground yet: a boulder a vessel could clip is a collider, and that is the moon's machinery (ADR 0092) with its own cost in the sim (a body per vessel near the ground); a later plan can extend `bodyHasStones` to hills bodies with a biome table and the site clearance of this one.
2. **A body-fixed lattice per size class** (`rock-scatter.ts`): the cube-face gnomonic chart of ADR 0068 (`chartOf`), 3 m cells for pebbles (0.05 to 0.14 m, drawn within 50 m) and 8 m cells for rocks (0.14 to 0.4 m, drawn to the preset's range). A cell holds at most one rock; its hash (`pcgX`, salted by the terrain seed) decides presence, place, size, yaw and shade. Presence is a chance made of the class, a patchy region hash, the biome weight and the site clearance. The function takes no camera and no origin: the same cell is the same rock on every visit, after every floating-origin shift and vessel switch.
3. **Biome weight** from the same height field the sim uses: none in water, on the shore (under 3 m) or in the snow (over 3 600 m, fading from 3 000 m); a third on sand under 40 m; more on the uplands and on steep ground, fewer on cliffs. No rocks within 700 m of a site's zone centre, all of them from 3 000 m (the site draws its own).
4. **Placement on the CPU in both renderers** (deviation from the plan's WebGPU compute pass and WebGL2 worker): the instances are plain three `InstancedMesh`es with a standard material, which both renderers draw; the heights come from the CPU field, which is what the planet pass bakes. A cache of cells asked about, filled nearest first within 4 ms a frame, makes a refresh a few hundred lookups and no terrain reads for cells already seen; instances are rewritten when the camera has moved 6 m. A compute pass has nothing to add until the GPU terrain mesh (plan 398) puts the ground and the rocks in the same buffers; then the instances can be culled there, and the CPU function stays as the reference.
5. **Two LODs, no impostor.** A 320-triangle rock within 26 m and an 80-triangle one beyond; a rock of 0.4 m is under a pixel past a few hundred metres, so nothing is drawn beyond the range. The meshes are not shadow casters (the sun's shadow map is fitted to the vessel).
6. **Quality** (`PresetSettings.rocks`): Low none; Medium half the density to 90 m; High all of it to 220 m.
7. **Detail normal maps are not in this plan.** The ground is still the ray-marched height field; its detail albedo (ADR 0306) stays. A normal map on it means a second triplanar read and a tangent frame in both pass twins, and plan 398 replaces that ground with a mesh; the maps go onto the mesh there.

## Consequences

- The rocks follow the terrain by the CPU field, the planet pass by its bake of the same function: they agree to the bake's texel (about 4 m at the fine patch), so a rock may sit a few centimetres proud or sunk on a steep slope.
- When 398 lands: the instances can read the mesh's heights in the vertex shader like the moon's stones read the patch, the placement can move to a compute pass per visible cell, and the ground gets detail normals.
- The first fill of a view costs up to 4 ms a frame for a few frames; nothing is drawn above 150 m over the ground.
