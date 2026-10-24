# 415 — The pad without the launch site

**Plan:** [plans/415-the-pad-without-the-site.md](../plans/415-the-pad-without-the-site.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0371](../decisions/0371-mesh-terrain.md) (addendum)

## What was found

`scripts/measure-pad-breakdown.ts` (headed, M5, Chrome, Vite dev build, `high`, DSF 2, site off, GPU timestamps overlap on Apple GPUs so the frame mean is the measure): the booster at the pad with one piece off at a time. The earlier 3.6 ms over orbit was the mesh terrain of plan 398 itself:

| pad, site off | mean frame ms | GPU ms |
|---|---|---|
| mesh on (398 as merged) | 10.7 to 15 | 6.9 |
| mesh off (the march) | 8.3 to 8.7 | 5.3 |

The mesh's vertices and pixels were not the cost: its levels (15 / 40 m against 12 / 160 m: 17.0 and 17.6 ms in the same run) and its image size (full, half, quarter: 17.0, 16.6, 17.1) changed nothing. Two things did:

1. **The CPU walk**: 0.7 to 0.8 ms a frame (`selectNodes`, the patch frames and an array literal per patch, measured by a bench and in the page) for a camera that stands still.
2. **The launch site's flat zone**: the march never looks inside the zone (`uSkipR`), so the ground there is the sea-level sphere, shaded by the cheaper sphere path; the mesh's ground there was a terrain hit and took the heavier terrain shading, about 1.6 ms of GPU.

## What was done

- `TerrainMesh` selects the patches again only when the camera has moved more than 1 m (the morph covers the difference); between selections only the patch centres relative to the camera are rewritten, and a camera that does not move uploads nothing. CPU: 0.80 to 0.00 ms standing at the pad.
- The planet pass ignores the mesh's ground nearer than `uSkipR / sqrt(max(1 - d^2, 0.0025))`, as the march does; the pixel falls to the sphere hit it had before 398. The look is unchanged ([pad mesh](assets/398-415-pad-mesh.jpg) against [march](assets/398-415-pad-march.jpg), the same picture).
- `meshTuning` (`__meshTuning` in a page: `maxLevel`, `range0`, `scale`, the CPU ms of the walk and the draw) for the measuring.

## After (same machine, site off, alternating states, 3 rounds)

| pad | mean ms | p95 ms | > 8.4 ms | GPU ms |
|---|---|---|---|---|
| mesh on | 8.77 | 12.5 | 32 % | 5.4 |
| mesh off | 8.68 | 12.3 | 34 % | 4.8 |

At altitude, the same harness (2 rounds, 5 s): 50 m 9.2 on / 10.2 off, 300 m 15.5 / 16.6, 1.5 km 13.6 / 12.9 (noise of about 1 ms; the frames there are the clouds and the sea). The pieces table (one off at a time, site off, round 1, before the machine slowed down): base 8.41, no mesh 8.36, no terrain 8.51, no vessels 8.42, no shadows 8.38, no clouds 8.32, no sea 8.56, no rocks 8.39, all of them off 8.18 to 8.32 ms: the pad with the site off sits on the 120 Hz vsync (8.33 ms) and every piece is under it; GPU ms 5.6 against 3.5 with everything off, so about 2 ms of GPU is hidden by the vsync.

## Not done

`perf:gate` needs a production build on a quiet machine (the dev build did not settle in plan 398 either); the later rounds of every run on this machine slowed down (24 to 120 ms frames, "Array buffer allocation failed" in the page) with 180 MB of free memory, so only round 1 and short runs are used. The site's own 3 to 3.5 ms is plan 414. [manual] the M2 and Windows.
