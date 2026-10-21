---
id: 342
title: "The first map toggle and the last frame hitch after the world's loading screen"
status: draft
owner: ""
depends: [340]
phase: 8
created: 2026-10-22
updated: 2026-10-22
---

# 342 — The first map toggle and the last frame hitch after the world's loading screen

**Size:** S

## Goal

Plan 340 measured what is left after the world's warm-up:
- The first Flight → Map takes about 150 ms on both backends.
- On WebGPU, one 567 ms frame comes in the 8 s after the loading screen.

Find what each one builds (the map HUD's first mount, the path lines that are made on demand, the vegetation stage, Flight's first HUD frame) and move it into the warm-up or into idle time.

## Context

- Plan 340 and ADR 0290: `SceneModel.warmViews`, `lib/world-renderer.svelte.ts`.
- The measurement script `apps/web/scripts/.tmp-measure.ts` is described in plan 340.

## Acceptance criteria

- [ ] On WebGPU and WebGL, the first Flight → Map and the 8 s after the loading screen have no frame over 100 ms.

## Docs checklist

- [ ] STATUS row, journal, plan 340's measurement table updated.

## Log

- 2026-10-22: Drafted from plan 340's leftovers.
