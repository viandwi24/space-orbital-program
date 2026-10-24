---
id: 398
title: "GPU terrain near the surface: a compute CDLOD quadtree with indirect draws below about 20 km, real silhouettes, detail normal maps"
status: done
owner: "Worker A"
depends: [393]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 398 — GPU terrain near the surface

## Goal

Below about 20 km the ground is a rasterised mesh, not a per-pixel ray march: a CDLOD quadtree on the cube-sphere, walked by a compute shader that appends visible patches to one indirect draw, with per-vertex morphing between levels. The terrain gets real silhouettes and parallax, early-Z and hidden-surface removal on the tile GPU, and detail normal maps. Its cost no longer grows with march steps, which fixes the most expensive frames (pad and 3 km). Collision stays consistent with what is drawn. This delivers part of reference look 5 (terrain detail).

## Context

- Read: `refs/graphics-v2/02-browser-120fps.md` §3 (GPU-driven CDLOD: Taos 140–160 fps at 1280×800 on M-series [B23]; a three r186 + TSL landscape at 3–6 ms GPU on a base M4 [B24]; Pinson's compute quadtree [B25]; virtual texturing [B23]), §2 (indirect draws in **one** buffer [B12]; compute for bakes; WebGL2 has no compute) and §5 item 8 (XL, ADR first). `refs/graphics-v2/03-renderer-and-mod-audit.md` A2 (terrain march: prepass `terrainSteps` 48/80/128, refine 24/32/40, shadow march 0/5/8; height cube 512/768/1024; camera patches 4,096 m and 32,768 m, `packages/renderer/src/terrain-patch.ts:13`; `MARCH_BLOCK`, `terrain-model.ts:84`) and A6 "Terrain detail" (no normal maps; detail tiles below 8 m).
- Code: `packages/renderer/src/tsl/terrain.ts`, `tsl/planet-pass.ts`, `terrain-model.ts`, `terrain-patch.ts`; sim terrain `packages/sim/src/terrain.ts`, `packages/core/src/terrain.ts`.
- Collision: plan 391 makes the ground collider follow `terrain.heightAt`; the mesh here must use the same height function at the same resolution, or the vessel floats or sinks (ADR 0330 point 3: height maps feed the sim).
- ADRs: 0248, 0308 and 0310 (warm at load), 0330.

## Scope

**In:**
- **ADR first:** CDLOD on the cube-sphere (patch grid, levels, morph, seams across cube faces, camera-relative precision, the handover altitude to the march, WebGL2 fallback).
- A compute pass that walks the quadtree, culls, and appends visible patches to one indirect buffer; one instanced indirect draw.
- Heights from the existing height cube and camera patches (no new height source); per-vertex morph between levels.
- The refine march replaced below about 20 km; the march kept for far terrain and orbit.
- Detail normal maps blended by footprint.
- The planet pass composes with the mesh (sky, air, sea and clouds over a depth-tested ground); TAAU velocity for the mesh.
- A WebGL2 path: keep the march there.
- A consistency check between drawn heights and the sim's `heightAt`.

**Out:**
- Rocks and scatter (402); triplanar detail textures beyond the normal maps (402); orbital textures (403); mod height maps (406); virtual texturing.
- e2e tests (paused by the owner).

## Design notes

- All indirect arguments live in one buffer (B12: separate buffers cost milliseconds of validation on D3D12).
- Patches are positioned camera-relative to keep precision near the surface.
- The handover band (around 20 km) blends mesh and march to avoid a visible line; pick it by measurement.

## Steps

1. ADR for GPU terrain.
2. Quadtree walk and culling in compute; the indirect buffer; one draw.
3. Patch mesh with morphing, heights from the cube and patches; seams across faces.
4. Compose with the planet pass; velocity for TAAU; the handover band.
5. Detail normal maps.
6. Height consistency test against the sim; WebGL2 keeps the march.
7. Warm the pipelines; measure with 392's tooling; screenshots; the owner's look check.

## Acceptance criteria

- [x] `bun test packages/renderer` passes, including unit tests for the quadtree selection (levels by distance, no cracks: neighbouring patches differ by at most one level), the morph factor, and the cube-face seam mapping.
- [x] `bun test packages/sim` or `packages/renderer`: drawn vertex heights match `terrain.heightAt` within 0.05 m at sampled points around the pad and on a slope.
- [ ] `measure-sunrise.ts` with `STEP_TO` shows no pipeline compiled when crossing the handover altitude.
- [ ] Measured on the M5, WebGPU `high`: GPU ms and p95 frame interval at the pad and 3 km against 393–395 and the wave target p95 ≤ 8.4 ms; recorded in the journal. [manual: the M5 run]
- [ ] `capture-graphics.ts` screenshots at the pad, 3 km and 12 km: real ridge silhouettes, no seam or pop at the handover. [manual: the owner's look check against reference look 5]
- [x] `bun run typecheck`, `bun run build` and `bun run docs:check` pass. e2e paused by the owner.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/398-gpu-terrain-near-the-surface.md` written, with screens and numbers.
- [ ] `docs/architecture/` renderer doc: terrain near and far.
- [x] ADR for GPU terrain (step 1), linked above: 0343 (the structure), 0371 (the mesh).
- [ ] `docs/research/stack-versions.md`: three's indirect draw and compute APIs.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Worker A: ADR 0343 and stage 1: the CDLOD quadtree reference (cube-sphere mapping, selection, ranges, morph) with unit tests. Open: the compute walk, mesh, composition, handover, normal maps, height check, M5 numbers.
- 2026-10-24 — Worker A: ADR 0371, the mesh terrain: instanced CDLOD patches drawn into a distance image the planet pass reads in place of the march below 20 km (CPU selection; no compute walk), TAAU jitter hook, relevance gate, `setLookOff('mesh')`, `capture-398.ts`; 0 compiles in play, 14/15 textures; M5 GPU numbers noisy (3 km and 12 km lower, pad 1 to 2 ms higher), `perf:gate`, M2/Windows and detail normal maps open (journal).
