---
id: 065
title: "Richer mod models: deploy animations, KTX2, per-model LOD"
status: draft
owner: ""
depends: [051]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 065 — Richer mod models

## Goal

A model a mod ships can do what a generated part does and cost what a generated part costs: fold out (landing legs, solar panels), use compressed textures, and draw fewer triangles far away.

## Context

- Found, not done, in plan 051 (ADR 0076): models get plume, gimbal/hinge pivot (node `moving`), glow and shadows, but not `visual.deploy`; textures are PNG or JPEG only (no decoders in a package); one level of detail; no instancing of the static mesh in the VAB (a model has no `staticMesh`).
- Read: ADRs 0028, 0045, 0047, 0076; `research/mod-assets.md`; draft 040 (KTX2 on the stock side).

## Scope

**In (to be ordered at refinement):**
1. `deploy` for models: glTF animations (or named nodes) driven by the `deploy.flag` progress, with a size cap on animation data.
2. KTX2/Basis: ship the transcoder with the game (a static file, CSP `worker-src`/`wasm-unsafe-eval` already allow it) and let `inspectGlb` accept `KHR_texture_basisu`; measure memory and bundle cost against PNG on the sample.
3. LOD: a lower-detail model per distance or per graphics preset (`visual.asset` list or a `_lod1` convention) and instancing of identical static meshes in the VAB.
4. Several materials per palette: let `palette` recolour named materials of a model.

**Out:** executable renderer hooks, a hosted mod repository.

## Acceptance criteria

- [ ] To be made measurable at refinement.

## Docs checklist

- [ ] STATUS, journal, ADR, `writing-a-mod.md`, `research/mod-assets.md`.

## Log

- 2026-10-17 — Created as draft by plan 051 (found, not done).
