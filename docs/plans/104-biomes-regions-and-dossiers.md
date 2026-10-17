---
id: 104
title: "Regions on bodies and body dossiers"
status: draft
owner: ""
depends: [103]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 104 — Regions on bodies and body dossiers

## Goal

Bodies have regions (biomes) as data, drawn on the map and used by science subjects with multipliers; results fill a dossier per body (atmosphere profile, gravity, surface, regions found, resource hints), visible in the Mission Center or a body card.

## Context

- ADRs: 0099
- Read: ADR 0099 points 1 and 3, ADR 0067 (terrain kind per body), `packages/core/src/planet-map.ts` (biome colours), `moon-terrain.ts`.

## Scope

**In:**
- Region map per body: from the existing biome map for the home body and a seeded region map for the moon; `regions` on `defineBody` for mods.
- `regionAt(body, direction)` in core, used by situations.
- Map overlay of regions (renderer, toggled).
- Dossier component per world and body; entries unlocked by subjects.
- Body card UI.

**Out:** points of interest and comets (later).

## Touches

- **Size:** M
- **Edits:** `packages/core`, `packages/sdk`, `mods/stock`, `packages/renderer/src/map.ts`, `apps/web/src/lib/hud`
- **Shared contracts:** **SDK (`regions` on bodies), save (dossiers)**

## Design notes

Regions must agree with the drawn ground colours on the home body (same map).

## Steps

1. Region data and lookup.
2. Situation integration.
3. Map overlay.
4. Dossiers and body card.

## Acceptance criteria

- [ ] `packages/core` test: `regionAt` on the home body returns the biome the planet map colours at 1 000 sample directions.
- [ ] `packages/sim` test: the same experiment in two regions gives two subjects.
- [ ] vitest: the dossier shows the atmosphere profile entry after a "flying high" result on the home body.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/104-biomes-regions-and-dossiers.md` written.
- [ ] `guides/writing-a-mod.md` (regions).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0099).
