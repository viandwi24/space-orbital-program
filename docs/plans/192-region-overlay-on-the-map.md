---
id: 192
title: "Region overlay on the map view"
status: draft
owner: ""
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

- [ ] `packages/renderer` test: the overlay colour at 200 sample directions matches `regionAt` on the home body and the moon.
- [ ] vitest: the toggle switches the overlay and the hover label names the region.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated.
- [ ] `docs/journal/192-region-overlay-on-the-map.md` written.

## Log

- 2026-10-18 — Created as a draft by Agent 3 while refining plan 104: the map overlay left out of 104.
