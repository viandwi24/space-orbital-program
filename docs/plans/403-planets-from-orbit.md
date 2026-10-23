---
id: 403
title: "Planets from orbit: higher-resolution bakes, night lights, a 2D cloud cube at orbit distance, per-body texture streaming in KTX2"
status: draft
owner: "Worker B"
depends: [364, 397]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 403 — Planets from orbit

## Goal

Seen from orbit, Home, the Moon and the other stock bodies look like reference image 07: sharp continents and relief, city lights on the night side, clouds that match the weather below, and moons and planets with real surface detail instead of today's 512×256 palette maps. The scaled-space bakes come from the same surface function as plan 364, at higher resolution, and are baked on approach and evicted when far, streamed as KTX2. Low and Medium are cheap versions that hold a locked 60 on the lower targets (base M2; Windows PCs with Intel Iris Xe or AMD 680M integrated graphics, or GTX 1650 / RTX 3050 class cards, in Chrome or Edge on D3D12) and fit their memory.

## Context

- Design: `refs/graphics-v2/README.md` (look 7, and "better textures for Home's land, the view from above, the Moon and the other bodies"); ADR 0330 §3.
- Research:
  - `refs/graphics-v2/01-ksp-and-mods.md` §7 (`:198-216`): KSP's baked scaled-space maps, Kopernicus OnDemand cutting RAM (`:202`), EVE's 2D cloud cubemaps and city-light emissive maps (`:204`), and the recommendation: night-lights channel, a 2D cloud cube at orbit distance, bake on approach and evict far bodies, face size 512 / 1024 / 2048 (`:213-216`).
  - `refs/graphics-v2/03-renderer-and-mod-audit.md` A2 (`:59`, the scaled-space atlas 512/1024/1536 per face, `R/scaled-space-model.ts:8-14`; `:65`, body-look maps 512×256 on the CPU, `R/body-look.ts:16`), A6 (`:154`: 0.6–1 km a texel on Home, procedural biomes, no image textures, no city lights; other bodies are palette maps in five patterns).
  - `docs/research/planet-textures-and-sky.md` (plan 364's research).
- ADRs: 0306 (baked sky and scaled-space planet), 0318 (wider stock system and body appearance; §6 far bodies as Lambert spheres), 0086 (baked cloud map), 0037 (haze and cloud layers), 0160 (KTX2 transcoder), 0308/0310, 0330.
- Plans: 364 (done: the bake from `surfaceAt`, its journal's GPU ms), 397 (clouds v2: the weather coverage map this plan's cloud cube reads), 382 (small-body terrain), 392 (baseline), 404 (switch and quality), 406 (mod planets use this streaming).
- Code: `packages/renderer/src/{scaled-space-model,body-look,body-dress,moon,moon-model,planet}.ts`, `packages/renderer/src/tsl/{planet-pass,moon}.ts`, the biome map cache in `packages/core` (`planet-map-cache`).
- Reference image: `refs/graphics-v2/reference/07-planet-from-orbit.webp`.

## Scope

**In:**
- Home: bake face 2048 at `high`/Ultra (1024 at medium, 512 at low), mid octaves kept for the coasts; a **night-lights channel** in the bake (settlement density from the biome map: coasts, plains and rivers, none on ice or desert cores), shown on the night side only.
- A **2D cloud cube** at orbit distance, filled from plan 397's weather coverage map, cross-faded into the volumetric clouds as the camera descends; it casts onto the bake from orbit.
- The Moon and every other stock body with `terrain`: a scaled-space bake from its own surface function (the craters field, the small-body field) instead of the palette map; bodies without terrain keep improved procedural looks (bands, caps) at higher resolution.
- **Streaming:** a per-body bake/evict manager with a memory budget per preset; nearest bodies baked first, under the loading screen for the home system's near bodies, in the background otherwise (no frame over budget while baking); far bodies evicted.
- KTX2 (Basis UASTC/ETC1S) encoding of finished bakes cached in IndexedDB, so a revisit transcodes instead of rebaking; the transcoder from `/basis/` (ADR 0160).
- Quality levels (preset fields for plan 404): Low 512 faces, no night lights, cloud cube at half size; Medium 1024 with night lights; High 2048; Ultra 2048 with the cloud cube at full size.

**Out:**
- Mod-supplied planet maps (plan 406, which uses this streaming).
- Aerial-perspective froxels; a PQS mesh.
- Ring textures beyond today's.

## Design notes

- The bake stays one function shared with the ground view (plan 364's lesson: no mismatched bakes).
- The planet pass's 16-texture limit (`03:240`) applies: the night-lights channel goes into an existing atlas's spare channel if possible.
- Memory budgets per preset are stated in the ADR and checked by a test; the lower targets' integrated GPUs share system RAM, so Low's budget is small.
- KTX2 encoding at runtime was out of scope in plan 364; measure the encode time in a worker before committing to it, and fall back to caching raw RGBA8 if it is too slow.

## Steps

1. Capture "before": Home at 100 km and 2,000 km by day and night, the Moon at 50 km and 1,000 km, two other stock bodies.
2. ADR (next free number): face sizes and memory budgets per preset, the streaming policy, the KTX2 cache.
3. Home: larger faces, night-lights channel.
4. The 2D cloud cube from plan 397's map, with the descent cross-fade.
5. Bakes for the Moon and the other stock bodies from their surface functions.
6. The bake/evict manager and the KTX2 cache.
7. Quality fields and warm list; capture "after", frame-time and memory check, journal.

## Acceptance criteria

- [ ] `bun test packages/renderer` passes, including `test/body-bake-stream.test.ts`: with a fixed camera path past three bodies, the manager bakes in order of distance, never exceeds the preset's memory budget, evicts the farthest first, and rebakes nothing that is still resident.
- [ ] `test/night-lights.test.ts`: night lights are zero on the day side and on ice and open sea, and non-zero on settled coasts at night.
- [ ] `test/cloud-cube.test.ts`: the cube's coverage at a point equals plan 397's weather map at that point within a tolerance; the cross-fade weight is 1 at orbit and 0 below the volumetric range.
- [ ] `bun test packages/core` passes, including the KTX2 bake cache round-trip (or the raw fallback the ADR picks).
- [ ] The warm-list test includes the bake and orbit variants for every quality level; no bake builds a pipeline after load.
- [ ] `bun run typecheck` and `bun run docs:check` pass.
- [ ] e2e paused by the owner: none added.
- [ ] A quick look in a browser on WebGPU and WebGL; before and after screenshots in `docs/journal/assets/403-*.jpg`.
- [ ] No frame-time regression against plan 392's baseline in orbit (p95 frame interval); no frame over budget while a bake streams in.
- [ ] Low and Medium hold a locked 60 in orbit on the lower targets and stay inside their memory budget: measured with Chrome's CPU and GPU throttling as a stand-in, and on a Windows integrated-GPU machine when the owner can run it ([manual] for the real machine); the journal states which.
- [ ] [manual] The owner looks at Home by day and night, the Moon and two other bodies from orbit against reference image 07.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/403-planets-from-orbit.md` written.
- [ ] `docs/architecture/overview.md` (scaled space): night lights, cloud cube, streaming.
- [ ] The new ADR linked above and in `docs/decisions/README.md`.
- [ ] `docs/research/stack-versions.md` updated for the Basis encoder version.

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
