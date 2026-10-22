---
id: 367
title: "Vessel parts merged per material: fewer draw calls for big vessels"
status: draft
owner: ""
depends: [363]
phase: 8
created: 2026-10-22
updated: 2026-10-22
---

# 367 — Vessel parts merged per material: fewer draw calls for big vessels

## Goal

A ranked item from plan 363's research (`docs/research/frame-budget-and-efficiency.md` §5). The owner asked for efficient rendering and a playable frame rate on 2026-10-22.

## Context

Each part is a merged static mesh with one draw per material slot, plus moving pieces, plumes and lamps (`parts/factory.ts`).

Kronos V + Selene draws about 350 calls at `medium` and `high`, about 85 at `low`. Every part casts shadows, so the shadow pass repeats most of them.

On the M2 the main thread is 3.6 ms busy per frame in orbit, so this is not the limit there. It is on weaker CPUs, with several vessels in view, and in WebGL's driver overhead.

## Steps

- Merge a vessel's static part meshes per material into one mesh, rebuilt when the vessel's part set changes (staging, docking, a broken part).
- Keep moving pieces, heat-glow clones and effects separate.
- Consider `BatchedMesh` (three r186), which keeps per-part visibility and matrices without a rebuild.
- Measure draw calls, `_renderObjectDirect` time and the frame at 1, 5 and 20 vessels on both backends.

## Acceptance criteria

- [ ] Draw calls of Kronos V + Selene at `medium` fall by at least half; no visual change in `/dev/parts` and in the flight screenshots.
- [ ] `bun test packages/renderer` passes.
- [ ] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row; journal; ADR for any design choice.

## Log

- 2026-10-22 — Drafted by plan 363.
