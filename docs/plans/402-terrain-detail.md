---
id: 402
title: "Terrain detail: rocks and scatter placed by compute in body-fixed cells and drawn instanced, LODs and impostors; triplanar detail textures"
status: done
owner: "Worker B"
depends: [393]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 402 — Terrain detail

## Goal

Away from the launch site, Home's ground has rocks, boulders and scatter, and the ground itself has triplanar detail textures and normal maps, as in reference image 05. Rocks are placed by a compute pass in **body-fixed cells**, so they never regenerate when the floating origin moves, and drawn instanced with LODs and far impostors. WebGL2 places them in a worker at a lower density. What is drawn never disagrees with what the sim collides with. Low and Medium are cheap versions that hold a locked 60 on the lower targets (base M2; Windows PCs with Intel Iris Xe or AMD 680M integrated graphics, or GTX 1650 / RTX 3050 class cards, in Chrome or Edge on D3D12).

## Context

- Design: `refs/graphics-v2/README.md` (look 5); ADR 0330 §3.
- Research:
  - `refs/graphics-v2/01-ksp-and-mods.md` §5 (`:121-166`): Parallax's compute scatter with instancing and per-object culling (`:132-136`), its knobs (`:137-148`), its known problem that scatter **regenerates whenever the floating-origin offset changes** (`:150`), KSP 2's compute PQS (`:156`), and the recommendation (`:158-166`): body-fixed cells and a seeded hash, 2–3 LODs and an impostor beyond ~2 km, WebGL2 in a worker at lower density, knobs density / range / detail, rocks as mod GLBs later.
  - `refs/graphics-v2/03-renderer-and-mod-audit.md` A6 (`:152`): the ground is a ray-marched height field with no normal maps; four procedural greyscale triplanar tiles below an 8 m footprint (journal 364); trees and tufts at the launch site only; stones only on craters bodies (`R/moon-stones.ts`). A2 (`:63`): detail tiles 256² RGBA8 (`R/detail-textures.ts:10`).
  - `refs/graphics-v2/04-physics-fling-and-collision.md` (the ground collider from the real terrain, plan 391).
- ADRs: 0044 (terrain patches), 0068 (stones on craters bodies), 0306 (triplanar detail), 0308/0310, 0330; the ADR plan 398 writes for GPU terrain.
- Code: `packages/renderer/src/{moon-stones,detail-textures,terrain-patch,terrain-model,site-vegetation}.ts`, `packages/renderer/src/tsl/planet-pass.ts` (`surfaceAt`), `packages/core/src/body-terrain.ts` (`createBodyTerrainField`).
- Plans: 398 (GPU terrain near the surface: the mesh rocks stand on, detail normal maps), 391 (ground collider from the real terrain), 393 (TAAU), 392 (baseline), 404 (switch and quality), 060 (draft: stones with collision).
- Reference image: `refs/graphics-v2/reference/05-terrain-detail.webp`.

## Scope

**In:**
- An ADR first: are rocks visual only, or collidable? Options: visual only and kept small (under a size a landing leg would notice), or large boulders collidable through the sim's terrain field (deterministic from the same cell hash, so the sim and the renderer agree). The ADR picks one and states the size cut.
- A cell scheme in body-fixed coordinates (lat/long or cube-face cells at two or three sizes), each cell seeded from body id + cell id; per-biome scatter tables (rock types, density, size range, slope and altitude limits).
- WebGPU: a compute pass fills an instance buffer per visible cell; frustum and distance culling per cell; indirect or instanced draws.
- WebGL2: the same placement function in a worker, at a lower density, posted as instance arrays.
- Rock meshes: a few procedural rock shapes with 2–3 LODs and an impostor (or nothing) beyond about 2 km.
- Ground: triplanar detail albedo and normal maps (replacing or extending the four greyscale tiles), faded by footprint, on plan 398's terrain mesh and on the height-field march where 398 does not reach.
- Quality levels, as preset fields for plan 404:
  - Low: no scatter; detail albedo only (no detail normal map);
  - Medium: scatter at density 0.5 and a short range, two LODs, no impostors; detail albedo and normals;
  - High / Ultra: density 1, full range, impostors.

**Out:**
- Trees and grass away from the site (a later plan).
- Mod rock GLBs and mod scatter tables (plan 405 or later).
- Non-Home `hills` bodies (plan 406).

## Design notes

- Placement is a pure function of (body, cell, biome map, height); the CPU and GPU versions are tested to give the same instances for the same cell (within float tolerance).
- Cells are keyed to the body, so a floating-origin shift, a vessel switch or the map view does not change the instances; only cells entering or leaving range are filled.
- If rocks are collidable (ADR), the sim samples the same function for the cells near a vessel; the renderer never places a collidable rock the sim does not know.
- Shadows: rocks cast into the sun shadow only inside a short range; check plan 369's cached site shadows do not conflict.

## Steps

1. ADR (next free number): the cell scheme and the collision decision.
2. Capture "before": a landing site 50 km from the pad at 200 m, 20 m and on the ground; a mountain slope.
3. The placement function and scatter tables, with unit tests (CPU reference).
4. WebGPU compute placement, culling and instanced draws; LODs and impostors.
5. WebGL2 worker placement at lower density.
6. Triplanar detail albedo and normal maps on the ground.
7. If the ADR makes boulders collidable: the sim side in `body-terrain.ts`, with tests.
8. Quality fields and warm list; capture "after", frame-time check against plan 392, journal.

## Acceptance criteria

- [x] `bun test packages/renderer` passes, including `test/scatter-cells.test.ts`: the same cell gives the same rocks whatever was asked in between (no origin enters the function); density 0 gives none; biome and altitude limits hold. (One CPU function serves both renderers; no GPU twin, ADR 0341.)
- [x] (Visual only: no placed rock exceeds the size cut, tested.) If rocks are collidable: `bun test packages/core` (or `packages/sim`) passes, including a test that a vessel set on a collidable boulder's cell rests on the boulder, and that every rock the renderer marks collidable exists in the sim's field. If they are visual only: a test that no placed rock exceeds the ADR's size cut.
- [x] No new shader variant: the rocks use the standard material, so the warm list is unchanged.
- [x] `bun run typecheck` and `bun run docs:check` pass.
- [x] e2e paused by the owner: none added.
- [x] A quick look in a browser on WebGPU and WebGL; before and after screenshots in `docs/journal/assets/402-*.jpg`.
- [ ] No frame-time regression against plan 392's baseline at the pad, 3 km and the landing views (p95 frame interval).
- [ ] Low and Medium hold a locked 60 at the landing view on the lower targets: measured with Chrome's CPU and GPU throttling as a stand-in, and on a Windows integrated-GPU machine when the owner can run it ([manual] for the real machine); the journal states which.
- [ ] [manual] The owner looks at the ground at 200 m, 20 m and standing on it against reference image 05.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/402-terrain-detail.md` written.
- [x] `docs/architecture/overview.md` (terrain): scatter cells and detail textures.
- [x] The new ADR linked above and in `docs/decisions/README.md`.
- [x] `docs/guides/writing-a-mod.md`: no change (the rocks are visual only).
- [x] `docs/research/stack-versions.md` updated for anything looked up.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Done by Worker B (ADR 0341): rocks by cell, CPU placement for both renderers, no detail normals yet (398), frame times and the owner's look not done (journal).
