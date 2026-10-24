# 398 — GPU terrain near the surface

**Plan:** [plans/398-gpu-terrain-near-the-surface.md](../plans/398-gpu-terrain-near-the-surface.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0343](../decisions/0343-gpu-terrain-cdlod.md), [0371](../decisions/0371-mesh-terrain.md)

## What was done (stage 1: the structure)

`packages/renderer/src/terrain-quadtree.ts`: `dirOf` and `faceUV` (cube-sphere mapping and its inverse across seams), `nodeAt`, `nodeSphere` (with height bounds), `rangeOf` (doubling), `selectNodes` and `morphFactor`. `test/terrain-quadtree.test.ts`: the mapping round-trips on every face, a node contains its centre, six roots from far and the finest level at the camera, every sampled direction is in exactly one patch, neighbours differ by at most one level (cameras beside a cube edge and a corner), ranges double, the morph curve.

## What was done (stage 2: the mesh, ADR 0371)

`terrain-mesh-model.ts` (patch frame, the stable vertex formula, morph, instance data) and `tsl/terrain-mesh.ts` (one instanced 16 by 16 patch with a skirt ring, heights from the same baked cube and camera patches the march reads, drawn into an R32F distance image with depth). The planet pass reads the image where it marched (full, half, edge), the march prepass is not drawn while the mesh is on, and under TAAU the image is drawn in a hook right after the TAAU node sets the jitter. `Environment` turns the mesh on below 20 km (the relevance level of ADR 0369); `debug.setLookOff('mesh', true)` is the A/B. The quadtree takes the sim's heights for its bounds (`heightAt`, `maxSlope`). The compute walk and indirect draw of the plan's wording were not built (ADR 0371, why).

Tests: `terrain-mesh-model.test.ts` (vertices on the sphere and the face direction, float32 precision of the stable formula against the naive one, vertex heights within 0.05 m of `createTerrainField().heightAt`, the morph, instances cover the sphere); renderer tests 1063 pass; `tsc` clean.

## Checks run (M5, Chrome, Vite dev build, `high`, WebGPU)

- `probe-textures --gate`: no pipeline over 15 sampled textures, none failed, the mesh pipeline created once (`terrain-mesh-prepass`); planet-full still 14.
- `measure-long-frames` (flight, 60 s, the governor on): 7189 frames, p50 8.3 ms, p95 10.0 ms, max 18 ms; **compiled in play 0**.
- Screens (`capture-398.ts`, mesh and march): [pad](../journal/assets/398-after-pad-mesh.jpg) / [march](../journal/assets/398-after-pad-march.jpg), [3 km](../journal/assets/398-after-3km-mesh.jpg) / [march](../journal/assets/398-after-3km-march.jpg), [12 km](../journal/assets/398-after-12km-mesh.jpg) / [march](../journal/assets/398-after-12km-march.jpg). Same ground, same shading; no cracks, seams or popping seen at the three heights.

## GPU cost, mesh on and off (`measure-looks.ts`, `SCENES=pad,3km,12km LOOKS=mesh`, GPU ms)

The machine was shared (frame p95 17 to 90 ms in both states, GPU ms swinging 3 to 14 between rounds), so these are indications, not a result:

| scene | mesh on | mesh off | note |
|---|---|---|---|
| pad (2 runs, 4 + 2 rounds) | 7.3 to 9.6 | 5.7 to 8.7 | the mesh costs about 1 to 2 ms more here: the march is cheap on the pad's flat zone |
| 3 km | 9.6 and 5.9 | 13.9 and 5.4 | lower with the mesh in one run, equal in the other |
| 12 km | 9.1 | 11.5 | lower with the mesh |

The `perf:gate` run on the dev build did not settle ("warming did not settle in 3 minutes", p95 166 ms at the pad) and was stopped: it needs a production build on a quiet machine. **Open [manual]: the `perf:gate` table and the M2 / Windows numbers**, and the pad's 1 to 2 ms: the next lever is fewer vertices at the finest levels (a 8 by 8 patch inside 100 m) or a flat-zone skip.

## Not done

Detail normal maps (the shading keeps ADR 0044's patches and plan 364's triplanar); `measure-sunrise.ts` with `STEP_TO` across 20 km (the mesh pipeline is built in the warm-up, and the long-frame run shows 0 compiles); the WebGL2 path is unchanged (the march); the owner's look check [manual].
