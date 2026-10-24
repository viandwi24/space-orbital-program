---
id: 367
title: "Vessel parts merged per material: fewer draw calls for big vessels"
status: done
owner: "Worker A"
depends: [363, 373]
phase: 8
created: 2026-10-22
updated: 2026-10-24
---

# 367 — Vessel parts merged per material: fewer draw calls for big vessels

## Goal

A ranked item from plan 363's research (`docs/research/frame-budget-and-efficiency.md` §5). The owner asked for efficient rendering and a playable frame rate on 2026-10-22.

When this is done, a vessel's static part meshes draw once per material and paint, not once per part, so big vessels and several vessels in view cost far fewer draw calls.

## Context

- Each part's template merges its geometry per material slot (`mergeGeometries`, `packages/renderer/src/parts/builder.ts` ~147). Each part is then its own mesh per slot, plus moving pieces, plumes and lamps (`parts/factory.ts`).
- Paint slots take the vessel's palette (`materials.get('paint-primary', palette)`, `factory.ts` ~206).
- A part clones its materials the first time it glows from heat (`cloneMaterials`, `factory.ts` ~306).
- No `BatchedMesh` is used yet.
- Plan 363 counted about 350 calls for Kronos V + Selene at `medium` and `high`, about 85 at `low`, with the shadow pass repeating most. These numbers predate plans 370, 373 and 380–384.
- ADR 0290 and ADR 0310: every pipeline the world can draw is built at load or in the background, never in a frame.

## Scope

**In:** static part meshes, merged per material plus paint per vessel.
**Out:** moving pieces, heat-glow clones and effects stay separate.

## Steps

1. Measure again: draw calls, `_renderObjectDirect` time and the frame at 1, 5 and 20 vessels on both backends.
2. ADR: a merged mesh rebuilt when the part set changes (staging, docking, a broken part), or `BatchedMesh` (three r186), which keeps per-part visibility and matrices without a rebuild. A glowing part leaves the batch.
3. Implement; warm the new batched or merged pipelines at load (ADR 0290, ADR 0310) so the first vessel does not compile in a frame.
4. Measure after.

## Acceptance criteria

- [ ] Draw calls of Kronos V + Selene at `medium` fall by at least half, before and after in the journal; `capture-graphics.ts` and `/dev/parts` screenshots unchanged.
- [ ] `measure-sunrise.ts` shows no new pipeline compiled after load.
- [ ] `bun test packages/renderer` passes.
- [ ] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row; journal; ADR for the batching choice.

## Log

- 2026-10-22 — Drafted by plan 363.
- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: still valid; no `BatchedMesh`, parts merge per part; merge by material plus paint; new pipelines warmed at load (ADR 0290, 0310); measure again first; depends adds 373.
- 2026-10-24 — Worker A: done. ADR 0352; a `VesselBatch` per vessel merges the static part meshes per material; draw calls at `medium` 273 to 121 at the pad and 226 to 74 at 3 km; screens unchanged; the first build merged nothing (non-indexed geometry), fixed.
