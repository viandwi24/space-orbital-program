# 398 — GPU terrain near the surface

**Plan:** [plans/398-gpu-terrain-near-the-surface.md](../plans/398-gpu-terrain-near-the-surface.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0343](../decisions/0343-gpu-terrain-cdlod.md)

## What was done (stage 1: the structure)

`packages/renderer/src/terrain-quadtree.ts`: `dirOf` and `faceUV` (cube-sphere mapping and its inverse across seams), `nodeAt`, `nodeSphere` (with height bounds), `rangeOf` (doubling), `selectNodes` and `morphFactor`. `test/terrain-quadtree.test.ts`: the mapping round-trips on every face, a node contains its centre, six roots from far and the finest level at the camera, every sampled direction is in exactly one patch, neighbours differ by at most one level (cameras beside a cube edge and a corner), ranges double, the morph curve.

## Not done

Everything that draws: the compute walk and the indirect draw, the patch mesh with morph and heights from the cube and the camera patches, composition with the planet pass and TAAU velocity, the handover band, detail normal maps, the drawn-versus-`heightAt` check, warming, the M5 numbers and the owner's look check [manual]. The unit tests cover the pure reference only.
