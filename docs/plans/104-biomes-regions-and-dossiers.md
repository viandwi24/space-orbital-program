---
id: 104
title: "Regions on bodies and body dossiers"
status: in-progress
owner: "Agent 3"
depends: [103]
phase: 6
created: 2026-10-17
updated: 2026-10-18
---

# 104 — Regions on bodies and body dossiers

## Goal

Bodies have regions (biomes) as data, drawn on the map and used by science subjects with multipliers; results fill a dossier per body (atmosphere profile, gravity, surface, regions found, resource hints), visible in the Mission Center or a body card.

## Context

- ADRs: 0099
- Read: ADR 0099 points 1 and 3, ADR 0067 (terrain kind per body), `packages/core/src/planet-map.ts` (biome colours), `moon-terrain.ts`.

## Scope

**In:**
- `regions` on `defineBody`: `{ kind: 'biomes' }` (the biome classes of the canonical planet map of the world's seed and sites, for a `hills` body), `{ kind: 'cells', seed, regions: [{ id, label, multiplier? }] }` (a seeded map of cells on the sphere) and `{ kind: 'bands', bands: [{ id, label, from, to, multiplier? }] }` (latitude bands). Stock: home `biomes`, moon `cells` (highlands, maria, crater fields, poles).
- `regionAt(body, direction, world?)` and `regionsOf(body)` in core; a body without `regions` is one `global` region.
- Situations say whether they are regional (`regional`); stock landed, splashed, flying-low, flying-high and space-low are, space-high is global. A subject's region is the region under the vessel; the value is multiplied by the region's `multiplier`.
- Dossiers: `defineDossierEntry({ id, label, order, fact, unlock })`, where `unlock` is a set of situations and optionally experiments. Stock entries: atmosphere profile, gravity, surface, regions found, resource hints. `dossierOf(body, subjects, entries)` in core, derived from the saved subjects (no new save data).
- A body card in the Target panel when the target is a body: its dossier entries, locked entries with what unlocks them.

**Out:** the region overlay on the map (draft 192), points of interest and comets (later), resource data (the hints entry says what will be found once resources exist).

## Touches

- **Size:** M
- **Edits:** `packages/core`, `packages/sdk`, `mods/stock`, `apps/web/src/lib/hud`
- **Shared contracts:** **SDK (`regions` on bodies, `regional` on situations, `defineDossierEntry`)**; save unchanged (dossiers derive from `SimSave.science`)

## Design notes

Regions must agree with the drawn ground colours on the home body (same map).

## Steps

1. ADR 0180; region data, `regionAt`, schemas; core tests.
2. Regions in subjects (sim) and stock region data.
3. Dossier entries and `dossierOf`; stock entries.
4. Body card in the Target panel.

## Acceptance criteria

- [ ] `bun test packages/core/test/regions.test.ts`: `regionAt` on the home body returns `classifyBiome` of the planet map at 1 000 sample directions; cells and bands are deterministic and cover the sphere.
- [ ] `bun test packages/sim/test/science.test.ts`: the same experiment landed in two regions gives two subjects; a space-high result is `global`.
- [ ] vitest: the body card shows the atmosphere profile entry after a flying-high result on the home body, and shows it locked before.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/104-biomes-regions-and-dossiers.md` written.
- [ ] `guides/writing-a-mod.md` (regions, dossier entries), `architecture/simulation.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0099).
- 2026-10-18 — Refined and claimed by Agent 3. Dossiers derive from the saved subjects, so the save does not change. The map overlay moves to draft 192, and the body card goes in the Target panel. Design choices go in ADR 0180.
