# 0068 — Terrain-cast shadows and stones as instanced geometry on an airless body

**Status:** accepted (point 9, "no collision", is superseded by [0092](0092-stones-are-colliders-from-one-core-lattice.md); the lattice now lives in `@orbital/core`)
**Date:** 2026-10-17
**Plan:** plans/052-moon-terrain-shadows-stones-and-terrain-kind.md
**Builds on:** ADR 0054 (the moon pass), 0058 (light and dust on an airless body), 0044 (patches), 0053 (frame budget), 0067 (terrain kind).
**Research:** [terrain-shadows-and-stones.md](../research/terrain-shadows-and-stones.md)

## Context

On the moon the sun's light was a shadow-map shadow of the vessel and a Lambert term: a crater rim cast no shadow, so a low sun showed a bowl as lit as its rim, and the ground was flat but for bump-mapped stones that never stood out of it. Plan 049 left both out (the shadow needs a march through the baked patch and a decision about the vessel; stones need instances and a collision answer).

## Decision

### Terrain shadows

1. **A march in the fragment shader** (`moonSunVisibility` in `shaders/moon.glsl.ts`, tested CPU twin `terrain-shadow.ts`): from the ground point toward the sun, `steps` samples of the baked height patch (the fine patch, then the mid patch when the ray leaves it, then nothing: the ray ends). A ray point is blocked when its height above the reference sphere is below the field under it. Samples run at a quadratic spacing from 1.5 m to `relief / sin(elevation)` (clamped to 80 m to 5 km: 300 m of relief to clear); the height above the sphere is computed as `(|Q|^2 - R^2) / (|Q| + R)` from small terms, so float32 keeps millimetres at 190 km. The smallest clearance in units of the sun's angular radius (tangent 0.00466) gives the visibility `clamp(0.5 + 0.5 a / 0.00466, 0, 1)` with `a = (clearance + 0.05 m + 0.004 t) / t`: a soft edge from the sun being a disc, a bias for the coarser mesh against the baked field.
2. **Skipped where it cannot matter**: at a sun at or above sine 0.46 nothing shades the ground (the field is no steeper than `MOON_MAX_SLOPE` 0.5, sine 0.447), so the march is not run; below -0.35 the point is in its own night.
3. **Steps by preset**: 24, 16, 10 (`SHADOW_STEPS`): a uniform bound in the shader, no recompile on a preset switch. The share of ground shaded changes by under 10 points between 24 and 10 steps (test).
4. **Where it applies**: the visibility multiplies the colour of the directional (sun) light in the patch and stone materials (`lights_fragment_begin` of three's chunk with one line added after `getDirectionalLightInfo`); other lights (the plume's) are unaffected. The whole-body mesh is seen from too far for it.
5. **The vessel** is not drawn with the moon's shader. The scene computes the same visibility on the CPU at the active vessel (the exact `moonHeight`, only below 3 km altitude, recomputed when it moved 0.5 m or the sun moved) and scales the sun light by it (at least 0.03: a trace of sun remains, and the regolith bounce of ADR 0058 is untouched). The moon's own shader divides that scale out again (`uSunScale`) so the ground is not shaded twice. The vessel's shadow on the ground stays the sun's shadow map as before; the two multiply.

### Stones

6. **A world-fixed lattice**: a gnomonic cube-face chart of the body (a metre of chart is a metre of ground near the middle of a face, which is where the landing plain is; up to 2x stretched at a face edge) with cells of 2.4 m; a cell holds at most one stone whose presence (patches of quiet and busy ground by a 24 m region hash: 4 to 54 percent of cells), place, radius (0.16 to 0.62 m, one in 33 times 2.4 for a boulder), yaw and shade are hashes of `(face, i, j)` (`stones-model.ts`, the same `pcgX` the terrain uses). The same stone stands in the same place in every session and on the GPU.
7. **Instanced geometry near the camera**: stones within 56 m of the camera (at most 1024, nearest first; mean 282, most 470 over random ground) are instances of two unit rocks (an icosphere moved by a hash of each vertex, flat shaded): 320 triangles within 18 m (at most 256), 80 beyond. An instance is its place in the fine patch's coordinates, radius and yaw; the vertex shader reads the height from the baked patch, so a stone stands on the ground it is drawn with and nothing is read back from the GPU. The list is rebuilt when the camera has moved 8 m or the patch re-centred (a few thousand hashes). They are drawn below 140 m altitude. They cast shadows (a depth material repeating the displacement) and take the terrain shadow of their base.
8. **The same lattice in the ground shader**: beyond the instanced radius a stone is a dome of the same cell function in the bump of the ground (`stoneDomes`, `STONES` constants shared), fading in as the instances shrink out between 34 and 47 m, and out beyond 90 to 260 m where a stone is under a pixel. The old value-noise `big` stones are gone.
9. **No collision.** Stones are scenery: the sim's ground is a height field and a stone is at most 1.5 m (a boulder; typically 0.3 to 1 m) across, half of it above the ground. A lander's legs can sink into one. A stone with collision would be a sim feature (a second ground object kind) and is draft 060 ([plan 060](../plans/060-stones-with-collision.md)).

## Alternatives considered

- **Horizon maps** (Snyder and Nowrouzezahrai): precomputed per azimuth for a fixed light and field; the sun moves (time warp) and the patch re-centres, so a per-fragment march of a few steps is simpler and cheap enough (below).
- **Shadow map for the terrain**: a second cascade covering kilometres at the resolution of rims (metres) costs more than the march, and the terrain is a baked texture already.
- **A matrix per instance on the CPU** with a height from the sim: needs the height at every stone each rebuild (the exact function costs ~30 us, 300 stones = 9 ms) and misses the GPU's own surface.
- **Stones from the sim** (a collision answer): see 9.

## Consequences

- Measured on the M5 at 1920 x 1080 (journal 052), sync ms, HEAD against this change: moon plain, 35 degree sun (no march): high 4.85 to 5.07, medium 4.73 to 5.16, low 3.16 to 4.09; plain at a 7 degree sun: high 4.94 to 6.8, medium 4.85 to 6.15, low 3.16 to 4.76; crater site, 7 degree sun: high 6.07 to 9.66, medium 6.04 to 8.64, low 4.16 to 6.01. The worst is 9.7 ms against the 14.4 ms of `high` (ADR 0053's budget); the stones cost about 0.3 ms. The pad: 14.02 to 13.77 / 13.68 (noise; the pad code is untouched).
- GPU against CPU: 1 389 pixel sites of three scenes (3 to 5 degree suns, 69 to 332 shaded each) agree in 99.1 to 99.3 percent with the CPU twin; the others are edge pixels of the penumbra.
- A shadow edge is quantised by the step spacing (75 m at 300 m from the ground point, 250 m at 2 km) where the penumbra is narrower: far rims have slightly stepped shadows. Not measured on M1/M2, Intel or a phone-class GPU: the step counts per preset are by M5 cost.
- Stones near the face seams of the chart (190 km from the landing plain) are missing across a seam within the instanced radius.
