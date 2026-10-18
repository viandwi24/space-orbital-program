---
id: 192
title: "Region overlay on the map view"
status: done
owner: "Agent 1 (Lead)"
depends: [104]
phase: 6
created: 2026-10-18
updated: 2026-10-18
---

# 192 — Region overlay on the map view

## Goal

In map view the player can toggle an overlay that tints each body by its science regions (plan 104), with the region names on hover, so a landing for a new subject can be planned.

## Context

- ADRs: 0099, 0180 (regions), 0067 (terrain kinds per body).
- Plan 104 built `regionAt(body, direction, world)` and the region data; the home body's regions are the biome classes of the canonical planet map, which the ground shader already reads.

## Scope

**In:** a toggle in map view; a region tint in the planet and moon shaders (the home biomes from the same map, cells and bands from their data); the region under the cursor.

**Out:** region borders as lines, points of interest.

## Touches

- **Size:** S
- **Edits:** `packages/renderer` (planet and moon materials, map view), `apps/web/src/lib/hud` (toggle)
- **Shared contracts:** none

## Steps

1. A region texture or shader function per body.
2. The toggle and the hover label.

## Acceptance criteria

- [x] `packages/renderer` test: the overlay colour at 200 sample directions matches `regionAt` on the home body and the moon.
- [x] vitest: the toggle switches the overlay and the hover label names the region.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated.
- [x] `docs/journal/192-region-overlay-on-the-map.md` written.

## Log

- 2026-10-18 — Created as a draft by Agent 3 while refining plan 104: the map overlay left out of 104.
- 2026-10-18 — Done by Agent 1 (Lead) on lead/followups:
  - The renderer gains `region-overlay.ts` and `setRegionOverlay` / `bodyDirectionAt` on the scene.
  - The web gains `hud/RegionsLayer.svelte` and `hud/regions-model.ts`.
  - The toggle lives in the flight map view, not in the Mission Center, which looks at the whole system from the Sun, so a planet is under a pixel there.
  - The tint is a texture from `regionAt`, not a shader function, so it matches the sim by construction.

  Tests that pass:
  - renderer `region-overlay.test.ts` (4): 200 directions on home and on the moon.
  - vitest `hud/regions.test.ts` (3).
  - Chromium `e2e/regions.e2e.ts`.
