# 0036 — Terrain heights are visual: baked on the GPU, ray-marched by the planet pass

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/027-terrain-and-sky-follow-ups.md

## Context

ADR 0030 left relief as shading only: no silhouette of a hill or mountain, a flat horizon from the pad, "debug view" by ADR 0025's bar. The sim and the physics keep a sphere with a flat ground tile (ADR 0019). Making the physics heights real is a large change (the height function must agree between TypeScript and GLSL to centimetres, the contact tile, altitude readouts, landed rails and warp all assume the sphere), and nothing in the visual bar needs it for the first release screenshots. The pad must stay flat, a vessel must never sit inside a hill, and the planet pass is a fullscreen analytic pass (ADR 0027: no meshes, no LOD seams, exact log depth).

## Decision

1. **Heights are visual only.** A height function of the body-fixed direction `h(n)` (metres above the reference sphere, `0 <= h <= TERRAIN_MAX_HEIGHT` = 4.5 km) displaces the *drawn* surface. Physics, the sim, altitude telemetry, trees and buildings stay on the sphere. `terrain-model.ts` is the reference implementation (pcg3d value noise in float64), `shaders/terrain.glsl.ts` its GLSL twin; every constant of the shader is generated from the TypeScript table.
2. **Shape.** Land mask from the biome map (zero in the ocean and a margin around coasts), rolling hills (4 octaves at 30 km), mountain ranges (a range mask at 55/28 km times a ridged multi-octave field, more where the map is high), plus a **scenic massif** ring 14 to 46 km around the launch site (noise-broken, so some azimuths see a 6 degree skyline and others a low horizon). Octaves are rotated between layers so the value-noise lattice never shows. The map's site-clear radius grew from 0.035 to 0.08 rad (blend to 0.2): the pad now sits on a 70 km island instead of a 40 km one, which gives the mountains room. This is world generation, not physics.
3. **The pad stays flat**: `h` is exactly zero within 5 km of the launch site and rises smoothly to full strength at 16 km (`siteWeight`). A second, camera-centred **bubble** flattens the terrain within 1.8 km of the camera's ground point (smooth over 3.5 km more) when the camera is below 2 km, and fades out between 2 km and 4.4 km altitude (`bubbleWeight`); a vessel flying or landing low never meets a hill that the physics ground does not have, and the camera is never inside a hill (tested: altitude above weight x max height at every altitude). The cost is visible and accepted: relief within about 5 km of a low-flying camera melts toward the camera instead of rising to the horizon. Landing anywhere else on a hill is still "on the sphere".
4. **Baked once, marched per pixel.** The first frame (and `setSite`, a new preset, a new map) renders the height function into a half-float RGBA **cube map** (`WebGLCubeRenderTarget`, 512 / 768 / 1024 texels per face by preset): height in R and the tangent gradient (rise over run, body-fixed) in GBA by forward differences. The planet pass finds the first hit of the ray with the displaced surface by **relaxed sphere tracing** of the baked heights (one cube fetch per step, step = 0.8 x clearance / (slope bound + descent rate), floored at 5 % of the distance, with three look-inside samples when the floor dominates so thin crests are not skipped), then 10 bisections. Rays that stay inside the flat zone are not marched at all (the start of the march jumps to the flat radius), so the ground pixels of the pad scene cost nothing extra. The march runs only inside the shell between the sea sphere and `TERRAIN_MAX_HEIGHT`.
5. **Shading** uses the baked gradient as the geometric normal and the existing ground shader on top: slope and altitude decide rock, tree line (forest below 0.9 to 1.6 km), alpine meadow, scree and a snow line (2.25 km, broken up by noise, not on steep faces), crags from the large octaves of the old relief shading (kept only where `h` is high), rivers stop above 60 to 260 m. **Terrain self-shadows** by a short march toward the sun on the baked heights (0 / 5 / 8 steps by preset). The atmosphere march ends at the terrain hit, so aerial perspective and haze apply to mountains for free.
6. **LOD** is the preset table (`terrainSize`, `terrainSteps`, `terrainShadowSteps`) and the step rule: step length and floor grow with distance and with the pixel footprint. A bake of a face costs a few milliseconds once.

## Alternatives considered

- **Physical heights now.** Right eventually (landing in mountains, collisions, radar altitude) and recorded as draft plan 031 with the requirement that TypeScript and GLSL agree (the TS height function here already is the reference for that). Not done here: it touches `packages/sim`, ADR 0019, surface rails and every altitude consumer.
- **Tessellated mesh (clipmap or quadtree).** Needs LOD, seams, a float-safe vertex path under the floating origin and a depth-correct join with the analytic atmosphere; the ray march reuses the existing exact pass and gives per-pixel silhouettes. A mesh stays an option when heights become physical.
- **Equirectangular height texture.** Poles pinch, seams at the date line, trigonometry per step; a cube map is a direction lookup with no trigonometry and hardware seam filtering.
- **Analytic height in the march (no bake).** 14+ noise octaves per step per pixel; far over budget (`high` at the pad is already at the 16.7 ms limit).

## Consequences

- The visual surface and the physics ground disagree by up to `h` away from the flat zones; documented in STATUS and `architecture/simulation.md` is unchanged (still a flat tile). A vessel that lands beyond the flat zones stands on the sphere while hills rise around it.
- One more GPU resource (a cube map of 12 to 50 MB) and one bake at start; `Renderer.setPreset` re-bakes when the size changes. WebGL 2 with half-float colour buffers is required (already true for the post chain).
- Pure maths with tests: `terrain-model.test.ts` (determinism, continuity, bounds, flat zones, skyline, marching against brute force, step rule, bubble).
