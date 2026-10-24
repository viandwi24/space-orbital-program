---
id: 409
title: "No periodic stutter, page side: no JSON churn per snapshot, cheaper snapshot transport, no per-frame allocations, so no major GC pauses"
status: ready
owner: "Worker C"
depends: []
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 409 — No periodic stutter, page side: no JSON churn per snapshot, fewer allocations, no major GC pauses

**Size:** M

## Goal

Stop the major-GC pauses that make the game stutter every few seconds. The owner's performance HUD shows the JS heap swinging between about 400 MB and 250 MB, roughly 150 MB per cycle.

## Context

- **Evidence:** the screenshots are in `refs/graphics-v2/reference/owner-spikes/` and the investigation is in `refs/graphics-v2/06-periodic-spikes.md`. The HUD's memory figure is `usedJSHeapSize` (`apps/web/src/lib/perf/perf-stats.ts:116-120`).
- **Space Center page:**
  - It runs `JSON.stringify` on the economy, the site and the draws for every snapshot, at 62.5 Hz (`apps/web/src/routes/(world)/space-center/+page.svelte:222`, `:236`, `:263-266`).
  - It also stringifies the labels every frame (`:522`).
- **Snapshots** are structured-cloned every 16 ms. Draft plan 365 covers the transport.
- **Smaller per-frame allocations:**
  - `packages/renderer/src/environment.ts:585`;
  - the governor's `slice`/`filter` (`quality-governor.ts:645-670`).
- **Earlier work:** plan 396 removed the HUD allocations.

## Scope

**In:**
- **Change detection without strings:** replace per-snapshot and per-frame `JSON.stringify` comparisons with version counters or shallow field compares, on every page. Search for other `JSON.stringify` uses in hot paths too.
- **Snapshot transport (absorbs draft 365):**
  - send the large static parts once, and only the deltas after that;
  - use a transferable binary layout for vessel and part arrays;
  - keep overlays and ropes on the cloned path.
- **Zero allocation on hot paths:** no per-frame allocation in `environment.ts`, the governor, or the page loops (preallocated arrays, ring buffers).
- **A GC test:** a unit or bench test that runs N frames of the Space Center and Flight loops with a fake snapshot stream and asserts the allocations per frame stay under a small bound.

**Out:**
- Renderer warming, pacing and rebakes, which belong to plan 408.

## Touches

- `apps/web/src/routes/(world)/space-center/+page.svelte` and the other page loops;
- `apps/web/src/lib/{sim-client,sim-host,messages}.ts`;
- `packages/core/src/protocol.ts`;
- `packages/renderer/src/{environment,quality-governor}.ts`.

## Steps

1. Find every per-snapshot and per-frame `JSON.stringify` and allocation, and list them in the journal.
2. Replace them, adding the allocation test.
3. Do the binary and delta snapshot transport (plan 365's scope). Add a round-trip test.
4. Measure the heap sawtooth for 2 minutes at the Space Center and in flight. Use Chrome's performance memory, or `usedJSHeapSize` sampling, under `/tmp/orbital-measuring`.

## Acceptance criteria

- [ ] The JS heap stays within about 30 MB over 2 minutes at the Space Center and in flight. There are no major-GC pauses over 2× the frame interval.
- [ ] No `JSON.stringify` in any per-frame or per-snapshot path, and the allocation test passes.
- [ ] The snapshot transport round-trip tests pass.
- [ ] Affected unit tests and the typecheck pass. E2E is paused by the owner.

## Docs checklist

- [ ] STATUS row.
- [ ] Journal with the before/after heap traces.
- [ ] Plan 365 marked dropped, with "folded into 409".

## Log

- 2026-10-24 — Created by the coordinator from the owner's stutter report and `refs/graphics-v2/06-periodic-spikes.md`. It absorbs draft 365. Highest priority for Worker C.
