---
id: 065
title: "Richer mod models: deploy animations, KTX2, per-model LOD"
status: in-progress
owner: "Agent 2"
depends: [051, 079, 090, 110, 091]
phase: 3
created: 2026-10-17
updated: 2026-10-18
---

# 065 — Richer mod models

## Goal

A model a mod ships can do what a generated part does and cost what a generated part costs: fold out (landing legs, solar panels), use compressed textures, and draw fewer triangles far away.

## Context

- Found, not done, in plan 051 (ADR 0076): models get plume, gimbal/hinge pivot (node `moving`), glow and shadows, but not `visual.deploy`; textures are PNG or JPEG only (no decoders in a package); one level of detail; no instancing of the static mesh in the VAB (a model has no `staticMesh`).
- Read: ADRs 0028, 0045, 0047, 0076; `research/mod-assets.md`; draft 040 (KTX2 on the stock side).
- Foundation (ADR 0104): models are data on parts and, now, on buildings (`defineBuilding` visual, plan 090); a mod's model choices are patchable through `definePatch` (plan 079), so LOD lists and palettes are typed fields, not conventions. Deploy animations are driven by the part action state of ADR 0102 (plan 110) as well as `deploy.flag`.

## Scope

**In (to be ordered at refinement):**
1. `deploy` for models: glTF animations (or named nodes) driven by the `deploy.flag` progress, with a size cap on animation data.
2. KTX2/Basis (plan 040 measured the cost in three 0.186.1: `basis_transcoder.wasm` 515 kB, 245 kB gzipped, plus `basis_transcoder.js` 56 kB, 15 kB gzipped; stock parts use procedural `DataTexture`s, so there was no textured asset to size a VRAM saving against and nothing to justify the bundle cost): ship the transcoder with the game (a static file, CSP `worker-src`/`wasm-unsafe-eval` already allow it) and let `inspectGlb` accept `KHR_texture_basisu`; measure memory and bundle cost against PNG on the sample.
3. LOD: a lower-detail model per distance or per graphics preset (`visual.asset` list or a `_lod1` convention) and instancing of identical static meshes in the VAB.
4. Several materials per palette: let `palette` recolour named materials of a model.

**Out:** executable renderer hooks, a hosted mod repository.

**Realignment (2026-10-17):** item 3 (LOD) applies to building models in the 3D Space Center (plan 091) as well as parts; a `_lod1` naming convention is replaced by a typed `visual.asset` list so patches can target it. Item 1 reads the action state of plan 110.

## Touches

- **Size:** M
- **Edits:** `packages/renderer/src/parts`, `packages/renderer/src`, `packages/core/src/mod-assets.ts`, `packages/sdk`, `apps/web/static`
- **Shared contracts:** SDK (`visual.asset` list, animation fields; additive), mod package format (KTX2 accepted)

## Acceptance criteria

- [ ] To be made measurable at refinement.

## Docs checklist

- [ ] STATUS, journal, ADR, `writing-a-mod.md`, `research/mod-assets.md`.

## Log

- 2026-10-17 — Created as draft by plan 051 (found, not done).
- 2026-10-17 — Plan 040 pushed its KTX2 item here with the bundle numbers above (it adds `KTX2Loader` only when an asset needs it).
- 2026-10-17 — Realigned with the owner's Fondasi Orbital decisions (ADR 0104, 0097, 0102: buildings get models too; typed LOD fields; deploy from action state).
- 2026-10-17 — `depends` gains 110, 091 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): item 1 reads the action state of plan 110 and item 3 covers the building models of plan 091.
- 2026-10-18 — Claimed by Agent 2 (Dev B, M2).
