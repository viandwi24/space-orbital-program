---
id: 363
title: "Frame budget research, and the first cuts: navball and staging allocations, the profiling build"
status: done
owner: "perf / auto quality session (Claude)"
depends: [261]
phase: 8
created: 2026-10-22
updated: 2026-10-22
---

# 363 — What a frame costs, and the first cuts

## Goal

The owner, 2026-10-22: "kita harus improve performance dan grafisnya terus ... grafis juga harus pakai metode seefisien mungkin untuk memproses gambar, menghapus object, melakukan caching ... tolong riset mendalam yah demi playable game ini".

1. Measure what the renderer, the HUD and the main thread spend per frame in the owner's scene.
2. Rank the techniques that fit three r186 (WebGPU with the WebGL2 fallback) by cost and gain.
3. Ship the top items with before/after numbers.
4. Leave the rest as draft plans.

## Context

- Plan 362 (ADR 0304): the governor fix. Its measurements are the GPU side of this research.
- `refs/graphics-performance/`: the plan 251–261 research (pixels, the M5 baseline, WebGPU).
- `docs/research/frame-budget-and-efficiency.md`: this plan's findings.

## Scope

**In:**
- `scripts/profile-frame.ts`, a CPU and allocation profile per frame with call chains.
- `ORBITAL_PROFILE=1` for an unminified build.
- The research doc.
- Allocation cuts in the navball (`navball-math.ts`) and in the staging Δv recompute.
- Draft plans for the larger items.

**Out:**
- Merging vessel parts into one mesh per material.
- Texture compression for the Earth textures.
- Temporal reprojection.

These are the draft plans below.

## Acceptance criteria

- [x] `docs/research/frame-budget-and-efficiency.md` covers:
  - the GPU and CPU frame;
  - culling and LOD;
  - instancing and merging;
  - pipelines;
  - caching;
  - textures;
  - render scale against preset;
  - pacing and battery;
  - memory.

  It also ranks the items.
- [x] Allocation per frame in the owner's scene (`profile-frame.ts`, orbit, medium) falls: 1143 → 951 KB (journal).
- [x] `bunx vitest run src/lib/navball-math.test.ts src/lib/hud` passes (85).
- [x] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` board row.
- [x] Journal `docs/journal/363-frame-budget-research-and-first-cuts.md`.
- [x] Draft plans for the ranked items not done here, each with a board row (365, 367, 368, 369).

## Log

- 2026-10-22 — Started with plan 362's measurements.
- 2026-10-22 — Done: research doc, navball and config-parse cuts, drafts 365/367/368/369.
