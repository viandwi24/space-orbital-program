# 0371 — The ground below 20 km is a mesh: a CDLOD quadtree drawn into a distance image

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/398-gpu-terrain-near-the-surface.md
**Builds on:** ADR 0036 (the baked heights), ADR 0044 (camera patches), ADR 0310 and 0367 (no compiles in play), ADR 0369 (relevance), ADR 0368 (15 sampled textures)

## Context

The ground is found per pixel by sphere-tracing the baked heights (`marchTerrain`, 48 to 128 steps plus a block prepass). It costs about 2.5 ms of GPU on the M5 at the pad and 3 km and scales with steps and resolution: the owner's M2 and Windows machines pay it most. A rasterised mesh pays per vertex and per covered pixel, has real silhouettes and hidden-surface removal, and does not grow with march steps.

Plan 398 asked for a compute pass appending visible patches to an indirect draw. That needs compute, which WebGL2 lacks, and a second pipeline with its own warm-up. The quadtree selection is a few hundred nodes, so it is done on the CPU.

## Decision

1. **A CDLOD quadtree on the cube-sphere, selected on the CPU** (`terrain-quadtree.ts`): per face a quadtree, `maxLevel` 15 (patches about 28 m wide on a 600 km body), range 40 m for the finest level, each level up twice as far. A node is kept if its bounding sphere (its own height, with slack for the steepest slope, `TERRAIN_MAX_SLOPE` 1.2 with margin) is in range, and is split if the child ranges are nearer. About 750 patches at the pad, 440 at 3 km, 300 at 12 km. The heights the bounds read are the sim's `heightAt` through a per-node cache.
2. **One instanced draw** of a 16 by 16 patch with a one-vertex skirt ring (`tsl/terrain-mesh.ts`). Per patch four vec4 of instance data (`terrain-mesh-model.ts`): the patch centre relative to the camera in float64 then float32, its cube-face frame, its span and its range. The vertex shader forms the vertex direction with the stable formula `(w - chat * delta) / |C + w|`, which avoids the cancellation of `radius (dir - chat)` (the float32 error is under 1 mm at 30 cm patches), morphs odd grid positions to even by the vertex's distance (CDLOD, so neighbouring levels agree on shared edges), reads the height from the same baked cube and camera patches the march reads (`TerrainSampler.heightAndSlope`), and drops the skirt ring so cracks between levels show ground, not sky. Crack-free with at most a one-level step is a property of the selection and is tested.
3. **The mesh draws a distance image, not shaded ground.** A prepass writes, into an R32F target of the pass's size, the distance from the camera to the nearest ground (0 = none), with a depth buffer (log depth like the scene). The planet pass reads that image where it used the march: `hitT = d > 0 && (no sea hit || d < sea hit)`, `tT = d`. Everything after the hit, the shading, the sea, the air, the shadows and the velocity for TAAU, is the code that already ran; the look does not change, the *finding* of the ground does. The march prepass is not drawn while the mesh is on. The texture binding is the march prepass's (one node, its value switched), so the pass stays at the same sampled-texture count: full 14, edge 15 (`probe-textures --gate`).
4. **Jitter.** Under TAAU the prepass is drawn from the camera as jittered for the frame, in a hook around the TAAU node's `setViewOffset` (which runs in the pipeline's before-render, after the scene pass's update). Otherwise it is drawn in `update`, before the half pass. On the half rung the image is full size and the half pass reads the full-size pixel under its pixel's centre; the edge pass reads its own.
5. **Handover.** `relevance.ts` says the mesh is wanted below 20 km (`terrain` level > 0). Above it, and with the mesh off (`debug.setLookOff('mesh', true)`, the A/B of the measuring tool), the march runs as before, so orbit and the WebGL2 renderer are untouched. The handover is a switch between two finders of the same surface, not two looks: there is no seam to blend.
6. **Nothing compiles in play.** The mesh's pipeline is built when the terrain's bakes first exist, with one degenerate patch (`warm`), which is the loading screen's warm-up. Patch data, the camera and the morph are data and uniforms.
7. **Heights.** The vertices read the baked cube and camera patches; the sim's `heightAt` is the formula those bakes sample. The model's test checks the CPU twin of the vertex against `createTerrainField(...).heightAt` within 0.05 m at sampled points and slopes (the bake's own resolution is the limit on the GPU side, as for the march and the collider of plan 391).

## Consequences

- The cost near the ground becomes vertices and covered pixels instead of march steps; the numbers are in the plan's journal.
- Detail normal maps stay with the shading (ADR 0044's patches and plan 364's triplanar); the mesh's own normals are not used.
- The CPU selection costs a few hundred node tests per frame; the instance buffer is about 12 KB.
- The compute walk and indirect draw of the plan's first wording are not built: WebGL2 keeps working and the walk is cheap on the CPU. A GPU walk can replace `selectNodes` later without touching the shader.
