# 0343 — GPU terrain near the surface: a CDLOD quadtree on the cube-sphere

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/398-gpu-terrain-near-the-surface.md
**Builds on:** ADR 0330 (graphics v2), ADR 0336 (TAAU), ADR 0310 (warm at load)

## Context

Below about 20 km the ground is a per-pixel ray march (`terrainSteps` 48/80/128, refine 24/32/40), whose cost grows with the steps and which gives no hidden-surface removal on a tile GPU and no mesh silhouettes. The wave's references show GPU-driven CDLOD terrain at 3 to 6 ms on base Apple chips.

## Decision

1. **The structure.** Six cube faces, each a quadtree; a face point (u, v) in [-1, 1]² maps to the sphere by normalising the cube point (`dirOf`; `faceUV` is the inverse and is the seam mapping, so a direction finds its face and cell across any cube edge). A node splits while the camera is inside its range; the range of a level is twice that of the next finer one (`rangeOf`); the bounding sphere includes the terrain height bounds. Neighbouring patches therefore differ by at most one level, including across cube edges (tested by sampling).
2. **The morph.** A patch's vertices morph to the parent's grid between 70 % of its range and the range (`morphFactor`), so a level change is not a pop.
3. **The walk.** The reference is `terrain-quadtree.ts` (pure, tested in Bun). The compute shader mirrors `selectNodes` and appends visible patches to **one** indirect buffer for one instanced indirect draw (all indirect arguments in one buffer: separate buffers cost milliseconds of validation on D3D12).
4. **Heights and precision.** Heights come from the existing height cube and the camera patches, with no new source, at the same resolution the sim's `heightAt` and plan 391's collider use, so the mesh and the collision agree (checked at sampled points, 0.05 m). Patches are positioned relative to the camera.
5. **The handover.** Below about 20 km the mesh draws the ground; the march stays for far terrain and orbit, with a blended band whose altitude is chosen by measurement. WebGL2 keeps the march.
6. **Composition.** The planet pass composes sky, air, sea and clouds over a depth-tested mesh; the mesh writes TAAU velocity.

## Staging

This commit lands the structure with its tests: the cube-sphere mapping, the selection, the ranges and the morph. The compute walk, the patch mesh, the composition, the handover band, the detail normal maps and the height consistency check against the sim are open in plan 398.

## Consequences

- The reference is the contract for the GPU walk: the shader is checked against `selectNodes` on the same cameras.
- Nothing changes on screen yet.
