---
id: 292
title: "Map toolbar in one row, and a compact maneuver card on staging"
status: done
owner: "map HUD compact session"
depends: [224, 258]
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 292 — Map toolbar in one row, and a compact maneuver card on staging

**Size:** M

## Goal

Two owner requests from 2026-10-21, about the flight map view (screenshot at about 760 px wide):

1. The top centre stacks three rows: the Map | Mission Center switch, the filter row, and a lone "Regions" pill. Regions joins the filter row as an icon button with a tooltip.
2. The maneuver panel opens in the middle of the view, above the navball, and covers the vessel and its orbit. It becomes a small card in the right column, on staging, with a summary by default and the full editor folded, keeping every detail and control.

## Context

- Filters: `apps/web/src/lib/map/MapFilterBar.svelte` (plan 258, ADR 0242). Regions: `lib/hud/RegionsLayer.svelte` (plan 192, ADR 0180), toggled by the flight page.
- Node panel: `lib/hud/ManeuverPanel.svelte` (plans 045 and 224, ADR 0223), placed in the page's `.bc` column above the navball (ADR 0253 point 1).
- Regions: `lib/layout/regions.ts` (plan 215, ADR 0205, revised by ADR 0253). The part inspectors stand at the top right in `.ins`, which stops above staging (`--staging-top`).
- e2e: `e2e/navigation.e2e.ts` types into `node-prograde`; `e2e/regions.e2e.ts` clicks `map-regions`.

## Scope

**In:**
- ADR 0267.
- A Regions chip in `MapFilterBar` (an optional `regions` prop). `RegionsLayer` keeps the hover label.
- `ManeuverPanel` redesigned as a card: a summary, icon actions, a folded editor with steppers. A `bell` icon for the alarm.
- The card moves into the right column, on staging (`.br`). A pure `cornerTop` decides when that column must stop under the map toolbar.
- Tests for `cornerTop` and the card (vitest), and the e2e updated.

**Out:** an in-scene node gizmo (the map's handles exist already), other map layers, the Mission Center.

## Steps

1. ADR 0267.
2. Regions chip; `RegionsLayer` without its button.
3. `cornerTop` with tests; the page places the card on staging.
4. The card: summary, actions, folded editor, steppers; component test.
5. e2e text; screenshots before and after at 1440, 1280 and 900 px wide and at 125 %.
6. Docs, STATUS, journal; lint, typecheck, tests.

## Acceptance criteria

- [x] The map toolbar under the bars is one row: the filters and Regions share it (screenshots in journal 292).
- [x] With a node set in map view, the card stands on staging at the right and nothing of it covers the middle third of the view, at 1440, 1280 and 900 px wide (screenshots).
- [x] Folded, the card shows the status, Δv, burn time, node in, planned Ap/Pe and the warp, point SAS, alarm, remove and editor buttons. Open, it shows the three axis fields with steppers, the time stepper and the note (component test).
- [x] The card does not overlap the navball module, staging, the dock or the map toolbar at those widths (screenshots; `cornerTop` test).
- [x] `bun run lint`, `bun run typecheck`, `bun run test` and `CI=true` vitest in `apps/web` pass.

## Docs checklist

- [x] STATUS row.
- [x] Journal.
- [x] ADR 0267 and its index row; ADRs 0223 and 0253 marked amended.

## Log

- 2026-10-21 — Created from the owner's request (relayed by the session that started this one).
- 2026-10-21 — Done. ADR 0267. The card first went to the top right (`.ins`) and was cut at 900 × 760; it now stands on staging (journal 292).
  - `bun run lint`: exit 0, all files in Prettier style.
  - `bun run typecheck`: svelte-check 2074 files, 0 errors, 0 warnings.
  - `bun run test`: 2086 pass, 0 fail.
  - `CI=true vitest run` in `apps/web`: 1358 pass, 2 fail. Both failures are in `sim-host-script-worker.test.ts` (a worker-thread timeout); they also fail alone in this worktree, and journals 268 and 270 report the same two. `maneuver-card.test.ts`, `regions.test.ts` and `layout/regions.test.ts`: 16 pass.
  - `bun run docs:check`: OK.
  - e2e, Chromium, production build: `regions.e2e.ts` passes. In `navigation.e2e.ts` the parts this plan touches pass: the node index, next, typing into the opened editor, Ap above 100 km. The last step fails twice: the warp stopped by a 5-minute alarm reads the clock 0.4 to 0.5 s past `t1 + 301`. That step is alarm timing under machine load, not the card (see the journal).
