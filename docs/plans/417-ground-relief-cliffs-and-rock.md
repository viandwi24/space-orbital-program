---
id: 417
title: "Ground relief: real cliffs, ridges and rock that read from 100 m to 30 km, at no more than 0.3 ms at the pad"
status: done
owner: "Worker B"
depends: []
phase: 9
created: 2026-11-08
updated: 2026-11-08
---

# 417 — Ground relief, cliffs and rock

**Size:** M

## Goal

On 2026-11-08 the owner said the land and cliffs on Earth lack detail. Today the heights have no feature finer than about 2 km: hills use 30 km × 4 octaves, ridges 16 km × 4 octaves, with a max slope of 1 (`packages/core/src/terrain.ts` 22–24, 63–93). Rock is a flat two-tone colour, and the triplanar detail adds albedo only (`tsl/planet-pass.ts` ~1094, ~1368–1410; `detail-textures.ts`). Make the terrain read as real terrain: cliffs, ridgelines, gullies and layered rock, from the pad to about 30 km.

## Context

- ADR 0375. Plan 403 and plan 402 (rocks).
- The heights are shared with the sim's collision. The mesh terrain is CDLOD (`tsl/terrain-mesh.ts`, below 20 km). Its patches are 4 km and 32 km wide (`terrain-patch.ts`), and the height cube is 512–1024 per face.
- Launch sites must stay flat: find the existing site flattening and keep it.

## Scope

**In:**
1. **Heights** (`packages/core/src/terrain.ts`):
   - Add ridged, eroded-looking octaves from about 4 km down to about 60 m in highlands and the rock mask.
   - Add steep, terraced cliffs (slope well above 1) at chosen places.
   - Keep lowlands and plains smooth enough to land on.
   - The function must stay deterministic and cheap enough for the sim and the patch bakes. Measure `surfaceAt` and height cost in a unit benchmark before and after.
   - Update test fixtures that pin heights, and say why in the journal.
2. **Rock shading:**
   - Pick rock by slope, so cliffs are rock.
   - Add strata bands along height, macro colour variation at 50–500 m, and triplanar detail normals, not albedo only.
   - Extend the detail texture to carry a normal or height channel. It must stay a single texture, within the ≤ 15 sampled textures per stage limit.
3. **Cheap self-shadowing on Low:**
   - Low's `terrainShadowSteps` is 0 today; use about 2–3 steps, or a slope or curvature AO term, so ridges read.
   - Its cost at the pad on the M5 must stay ≤ 0.3 ms (interleaved A/B).
4. **WebGL2 parity** in `shaders/planet.glsl.ts`.

**Out:** city lights, the orbit bake and clouds (plan 416, which edits the night, bake and cloud regions of the same files: keep your edits in the height, rock and material regions and rebase before merging); general performance work (plan 418).

## Steps

1. Take before screenshots on the M5, headed, WebGPU Low and High, from four views: a highland at 300 m, the same at 3 km, 30 km over mountains, and the pad. Save them as `docs/journal/assets/417-before-*.jpg`.
2. Heights, with a benchmark and tests. Check the sim landing and ground-contact tests in `packages/sim`.
3. Rock shading and detail normals.
4. Low self-shadow.
5. WebGL twin.
6. Take after screenshots. Run the dusk probe (0 pipelines) and the texture gate.

## Acceptance criteria

- [x] Cliffs and ridges are visible at 300 m and 3 km at Low and High (side-by-side screenshots in the journal); from 30 km the terraced massifs and their shadows read, single cliffs do not (a pixel there is thousands of metres).
- [x] Launch sites are as flat as before. The sim ground-contact and landing tests pass.
- [x] The height function costs no more than 1.5× the old one per sample (benchmark in the journal: 1.08 to 1.31).
- [x] Pad mean frame on the M5 at Low and High is within +0.3 ms of before (interleaved A/B, headed, the measuring flag): +0.00 and +0.12 ms, both against the display's cap (journal).
- [x] Dusk probe: 0 pipelines (High; Low reports 2 on a clean tree too). Texture gate passes.
- [x] `bun test packages/core packages/sim packages/renderer`, `bun run typecheck`, `bun run lint`, `bun run docs:check`.

## Docs checklist

- [x] STATUS row, journal `docs/journal/417-ground-relief-cliffs-and-rock.md` with screenshots, ADR 0375 linked; `docs/architecture` terrain page updated.

## Log

- 2026-11-08 — Created by the coordinator from the owner's M5 test (flat land and cliffs).
- 2026-11-08 — Done by Worker B ([journal](../journal/417-ground-relief-cliffs-and-rock.md), ADR 0375 addendum). Heights: 8 ridge octaves to 125 m, cliff terraces, `TERRAIN_MAX_SLOPE` 5, bakes band-limited by texel size; rock strata, tint and detail normals from the one detail texture; Low terrain shadow 3 steps. The plan's 60 m was 125 m: the mid patch's texel (32 m on High, 64 m on Low) cannot carry less, and the fine patch's 4 m / 8 m is exact for it. Hills stay at 4 octaves (the 1.5× cost limit).
