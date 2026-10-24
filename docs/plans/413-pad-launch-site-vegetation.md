---
id: 413
title: "The pad's frame: the launch site's grass tufts and trees were 3.7 ms of 20.9; thin the lawn by distance"
status: done
owner: "Worker B"
depends: [412]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 413 — The pad's frame

## Goal

Find what makes the pad's p95 about 26 to 33 ms on the M5 after plans 408, 410 and 412, and fix the largest part by relevance.

## Context

- Measured with `measure-looks.ts` (refs/graphics-v2/07-look-costs.md): with the launch site off the pad draws at 16.7 ms (from 20.9); with the vegetation off, 16.8. Tufts 2.6 ms, trees 1.1 ms. No look of plans 397 to 406 costs anything measurable there.
- Code: `packages/renderer/src/{site,site-meshes,environment}.ts`.

## Steps

1. Switches for the site, the vessels, the vegetation, its trees and tufts, and the shadows (`setLookOff`).
2. Tufts: eight cells a side instead of four, each cell's instances shuffled, and a share of each cell drawn by its distance from the camera (all within 15 m, a quarter at 40 m, a tenth to 160 m, none beyond).

## Acceptance criteria

- [x] `bun test packages/renderer` passes, including the new tuft-density tests (monotone; under half the lawn for a camera on the pad).
- [x] Pad mean frame 20.9 to 18.2 ms, frames over 16.7 ms from 25 % to 9 %, on the M5 at a pixel ratio of 2 (07-look-costs).
- [x] The lawn looks as before near the pad (journal screen `413-after-pad.jpg`).
- [x] `bun run typecheck`, `lint`, `docs:check`.
- [ ] The pad's p95 under 16.7 ms: not yet (9 % of frames still over); the trees (0.6 ms) and the planet pass are next.

## Docs checklist

- [x] `docs/STATUS.md`, `docs/journal/413-pad-launch-site-vegetation.md`, ADR 0370, `refs/graphics-v2/07-look-costs.md`.

## Log

- 2026-10-24 — Created and done by Worker B (ADR 0370).
