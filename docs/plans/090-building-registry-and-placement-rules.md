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

`defineBuilding` exists, stock registers its buildings (Hangar, Launchpad S/M/L, Runway, Mission Center, Astronaut Complex, R&D, Administration, tracking dish, propellant plant), sites hold placed buildings and roads, and the placement rules are pure, tested functions in core (grid, footprint inside the flat zone, no overlap, hazard clearance, road access with automatic completion).

## Context

- ADRs: 0097 (points 1, 4, 5), 0104, 0110, 0170; an ADR addendum at claim fixes the grid (below)
- Read: ADR 0097, plan 084 (the `Site` type in `WorldInfo.sites`, flat zones), plan 079 (`definePatch`, `PATCH_TARGETS`), `packages/renderer/src/site.ts` (today's layout: `PAD_RADIUS`, `BUILDINGS`, `ROADS`, site metres with +x east, +z south, origin at the pad centre), `refs/reverse-engineering-ksp2/beyond/08-space-center-building-and-colonies.md` §3 and §7 (summarised in ADR 0097).

## Scope

**In:**
- **Grid** (decided here, recorded in the claim ADR): square cells of **10 m** in site metres, cell `(i, j)` covers `x ∈ [10i, 10i + 10)`, `z ∈ [10j, 10j + 10)`; rotations 0, 90, 180, 270 degrees. A building at `cell` with `rotation` covers its rotated `size` from that corner cell.
- **`BuildingDefinition`** (core schema, registry `buildings`, report kind `building`): `id`, `label`, `size { w, d }` (cells), `entrances` (cells on the footprint edge, in local cells, at least one), `levels` (array, at least one: `{ cost, buildDays, upkeep, power, capacity: Record<string, number> }`; stock costs, days and upkeep are 0 here and set by 096), `provides` (capability ids: `launch-pad`, `runway`, `comms-node`, `lab`, `storage`, `production`, `crew`, `admin`, `mission-control`, `hangar`), optional `bodies` (allowed body ids; absent = any), optional `hazardRadius` (m, measured from the footprint's centre to any point of another building's footprint), `visual` (`{ kind: 'generator', generator }` or `{ kind: 'asset', path }`, ADR 0076).
- **Site data** (additive to 084's `Site`): `buildings: PlacedBuilding[]` with `{ id, kind, cell: { i, j }, rotation, level, state: 'active' | 'planned' }` (`id` from the host, a UUID; `state` stays `active` until 096) and `roads: Array<{ i, j }>`. Defaults `[]`, so no format bump (the re-sign of ADR 0111 covers the defaults).
- **`canPlace(site, registry, kind, cell, rotation)`** → `{ ok: true, roads: Cell[] } | { ok: false, reasons: PlaceReason[] }` with reasons `outside-zone` (a footprint cell farther than the site's flat-zone radius), `overlap` (names the other building), `hazard` (inside another building's hazard radius, or another building inside this one's), `no-road` (an entrance cannot reach the road network), `body` (not allowed on this body). Road completion: shortest 4-neighbour path on free cells from each entrance to the nearest road cell (BFS, ties broken by cell order), returned for the preview and added on placement.
- **Commands** (sim, instant in this plan): `place-building { site, kind, cell, rotation, id }` and `remove-building { site, id }`, refused with the same reason text `canPlace` gives; `Snapshot.sites` (site id, buildings, roads) for the HUD and 091.
- **Patching:** `building` added to `PATCH_TARGETS` (ADR 0170), so a mod can change a stock building's size or levels.
- **Legacy layout:** the Legacy site gets today's launch site as placed buildings (from `site.ts`, in cells): Launchpad S at the pad (3 × 3 cells centred on the pad), Hangar (8 × 5 at the old hangar), Mission Center (4 × 2 at the old control centre), Administration (5 × 3 at the old office), and the roads of `ROADS` rasterised to cells. Garages, service sheds, containers, vehicles and masts stay renderer scenery until 091.

**Stock sizes and hazards** (cells, m): Hangar 8 × 5; Launchpad S 3 × 3, hazard 40; M 5 × 5, hazard 80; L 7 × 7, hazard 140; Runway 4 × 120 (1.2 km), hazard 30; Mission Center 4 × 2; Astronaut Complex 4 × 3; R&D 5 × 4; Administration 5 × 3; tracking dish 2 × 2 (`comms-node`); propellant plant 4 × 4 (`production`), hazard 30. Three levels each; level capacities are placeholders (`launch-pad` mass limit 18 / 60 / 180 t for S / M / L; `hangar` part count 30 / 80 / 255) for 096 to tune.

**Out:** the 3D view and placement UI (091), costs and construction over time (096), earthworks to extend a flat zone (096), site choice (092).

## Touches

- **Size:** S
- **Edits:** `packages/core` (`buildings.ts` new: types, schema, `canPlace`, `completeRoads`; registry and plugin wiring; site schema fields; `patch.ts` target), `packages/sdk` (`defineBuilding`, exports), `mods/stock` (`buildings.ts` new, Legacy layout), `packages/sim` (commands, snapshot), `docs/guides/writing-a-mod.md`, `docs/architecture/plugin-system.md`
- **Shared contracts:** **SDK (`defineBuilding`, `PATCH_TARGETS` gains `building`), save (buildings and roads on sites, additive), protocol (`place-building`, `remove-building`, `Snapshot.sites`)**

## Design notes

Rules are pure so the UI previews them and the sim validates the same. The grid is in site metres, independent of the body's curvature: a 5 km flat zone is 500 cells across, and the rules work on cell sets, so a site check is O(buildings × footprint). The Legacy layout is checked by the same `canPlace`, which pins that today's site is a valid layout (hazard radii were chosen so it is: the control centre's nearest corner is 48 m from the pad centre).

## Steps

1. Claim ADR (grid, hazard measure, road completion); schema, registry, report kind, `PATCH_TARGETS`.
2. `canPlace` and `completeRoads` with tests for each reason.
3. Stock buildings and the Legacy layout; site schema fields.
4. `place-building` / `remove-building` in the sim; snapshot; save and resume.
5. Guide section.

## Acceptance criteria

- [ ] `packages/core` tests: overlap, outside-zone, pad hazard, body and missing-road cases each return their reason; a valid placement returns ok and the completed road cells; rotation 90 swaps the footprint.
- [ ] `packages/sim` test: `place-building` with an invalid cell is refused with the same reason text; a valid one appears in `Snapshot.sites` with its roads and survives a save and resume byte for byte; `remove-building` removes it.
- [ ] `mods/stock` test: every stock building validates, and every building of the Legacy layout passes `canPlace` against the others.
- [ ] `packages/core` test: a patch on `stock.launchpad-s` (`levels.0.capacity.launch-pad`) applies and shows in the load report.
- [ ] `bun run test`, web vitest, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/090-building-registry-and-placement-rules.md` written.
- [ ] `plugin-system.md`, `guides/writing-a-mod.md` (buildings).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097, 0104).
- 2026-10-17 — Refined by Agent 1 while waiting for `cp/f1-084-sites` (body only, status stays `draft`): 10 m grid and 90-degree rotations, the definition and site shapes, reason codes, BFS road completion, stock sizes and hazard radii chosen so today's site is a valid Legacy layout, `building` as a patch target, measurable criteria. Depends on 084's `Site` type; if 084 names fields differently, follow 084.
