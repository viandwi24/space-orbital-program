---
id: 235
title: "Space Center build menu: categories along the bottom, cards with building thumbnails"
status: done
owner: "Worker B (M5)"
depends: [233]
phase: 7
created: 2026-10-19
updated: 2026-10-19
---

# 235 — Space Center build menu: categories along the bottom, cards with building thumbnails

## Goal

Building at the Space Center feels like a city builder. A category bar runs along the bottom: Launch, Comms, Science, Crew, Administration, Production, Infrastructure, plus mod categories. Each category opens a row of cards. A card shows a rendered thumbnail of the building with its name, cost, size, build time and level range, and the requirements it still lacks. Hovering a card shows the full details. Choosing a card starts the placement preview.

## Context

- **ADR:** [0227](../decisions/0227-building-categories-and-build-menu.md) (categories by scope in the one registry, the cards, the thumbnail pass).

- **Owner request, 2026-10-19:** "the Space Center building menu is ugly; in Cities: Skylines there are categories at the bottom, e.g. comms with the dishes, with an icon or picture of each building". See ADR 0222 point 2.
- **Code:**
  - `apps/web/src/lib/space-center/SpaceCenterOverlay.svelte`
  - `apps/web/src/lib/space-center/model.ts`
  - building definitions in `mods/stock/src/buildings.ts`
  - renderer site buildings in `packages/renderer/src/site-buildings.ts`
- **Design:** `refs/space-orbital-program-ui-v2/source/v2/SpaceCenterV2.dc.html`. The dock at `bottom: 52` and the tokens apply.

## Scope

**In:**
- A `category` field on building definitions. It has a stock default per building, and mods add their own categories with an icon.
- The category bar.
- Card rows with horizontal scroll.
- Thumbnails: a renderer offscreen pass renders each building generator once at 256 × 160, caches it per session, and falls back to an icon while it loads.
- A details popover.
- Disabled cards show the reason in text.
- Keyboard navigation and 44 px touch targets.

**Out:**
- New buildings, except listing plan 234's dish in Comms when that plan is merged.

## Touches

- **Size:** M
- **Edits:**
  - `packages/core` building schema (`category`)
  - `mods/stock/src/buildings.ts`
  - `packages/renderer` (thumbnail pass)
  - `apps/web/src/lib/space-center/*`
- **Shared contracts:** building definition gains an optional `category`. The change is additive; mods without it fall back to "Other".

## Steps

1. Schema field and stock categories, with core tests.
2. Thumbnail pass with cache, with renderer tests: size, and that a cached thumbnail is reused.
3. Category bar and cards with details and reasons.
4. Placement hand-off to the existing preview.
5. Vitest for the model (cards per category, disabled reasons). Chromium e2e `e2e/build-menu.e2e.ts`: open Comms, see the dish card with its thumbnail, place it, construction starts.

## Acceptance criteria

- [x] `packages/core` tests and `apps/web` vitest for the category model pass.
- [x] `e2e/build-menu.e2e.ts` passes on Chromium, with a screenshot of the menu in the journal.
- [x] `bun run check:affected` passes, and CI is green on `ready/235`.

## Docs checklist

- [x] STATUS updated.
- [x] Journal written.
- [x] Mod SDK docs updated for `category`.

## Log

- 2026-10-19 — Created from the owner's manual test (ADR 0222).
- 2026-10-20 — Worker B (M5) claimed it (queue 233 → 235 → 236). ADR 0227 written before the code: building categories are the category registry's `scope: 'buildings'`, so mods add them through `ctx.categories` with no new registrar; `BuildingDefinition.category` and `description` are additive (API 0.1.84). Plan 234 is with Worker C: the e2e opens Comms and places the tracking dish; the deep-space dish joins Comms by naming `stock.comms`.
- 2026-10-20 — Off-world kinds now show at home as disabled cards ("Only at an off-world base") instead of being left out, so the reason is visible; buildable cards come first in a row.
