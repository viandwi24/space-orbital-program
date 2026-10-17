---
id: 090
title: "Buildings as data: `defineBuilding` and the placement rules"
status: draft
owner: ""
depends: [084, 079]
phase: 5
created: 2026-10-17
updated: 2026-10-17
---

# 090 — Buildings as data: `defineBuilding` and the placement rules

## Goal

`defineBuilding` exists, stock registers its buildings (Hangar, Launchpad S/M/L, Runway, Mission Center, Astronaut Complex, R&D, Administration, tracking dish, propellant plant), sites hold placed buildings, and the placement rules are pure, tested functions in core (grid, footprint inside the flat zone, no overlap, hazard clearance, road access).

## Context

- ADRs: 0097, 0104
- Read: ADR 0097 points 4 and 5, `refs/reverse-engineering-ksp2/beyond/08-space-center-building-and-colonies.md` §3 and §7 (git-ignored; summarised in ADR 0097).

## Scope

**In:**
- Schema: id, size (cells), entrances, levels (cost, build time, upkeep, power, capacity effects), `provides`, allowed bodies, hazard radius, visual (generator kind or asset).
- Site building list `{ id, kind, cell, rotation, level, state }` and roads (cell list).
- `canPlace(site, building, cell, rotation)` returning ok or reasons; automatic road completion along the grid.
- Legacy site gets the stock layout of today's launch site as placed buildings.
- Patchable through `definePatch` (079).

**Out:** the 3D view and placement UI (091), costs and construction over time (096).

## Touches

- **Size:** S
- **Edits:** `packages/core`, `packages/sdk`, `mods/stock`, `packages/sim`
- **Shared contracts:** **SDK (`defineBuilding`), save (buildings and roads on sites)**

## Design notes

Cell size and rotation steps are decided here (ADR addendum if they differ from 10 m and 90 degrees). Rules are pure so the UI previews them and the sim validates the same.

## Steps

1. Schema and registry.
2. Placement rules with tests.
3. Stock buildings and the Legacy layout.
4. Command `place-building` / `remove-building` validated in the sim (instant in this plan).

## Acceptance criteria

- [ ] `packages/core` tests: overlap, outside-zone, pad clearance and missing-road cases each return their reason; a valid placement returns ok and the completed road cells.
- [ ] `packages/sim` test: `place-building` with an invalid cell is refused with the same reason; a valid one appears in the snapshot's site and survives a save and resume.
- [ ] `mods/stock` test: every stock building validates and the Legacy layout passes `canPlace` for each building.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/090-building-registry-and-placement-rules.md` written.
- [ ] `plugin-system.md`, `guides/writing-a-mod.md` (buildings).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097, 0104).
