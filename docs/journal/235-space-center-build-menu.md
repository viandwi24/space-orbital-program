# 235 — Space Center build menu: categories along the bottom, cards with building thumbnails

**Plan:** [plans/235-space-center-build-menu.md](../plans/235-space-center-build-menu.md) · **Session:** Worker B (M5), 2026-10-20 · **ADRs:** [0227](../decisions/0227-building-categories-and-build-menu.md), 0222 point 2, 0146, 0115, 0123, 0125

## What was done

| Where | What |
|---|---|
| `packages/core` | `CategoryDefinition.scope` (`parts` when absent, or `buildings`), `scopeOf`, `FALLBACK_BUILDING_CATEGORY`, `buildingCategoryOf`; `BuildingDefinition.category` (a category id) and `description`; API 0.1.84. The SDK re-exports the helpers |
| `mods/stock` | eight buildings-scope categories (Launch, Comms, Science, Crew, Administration, Production, Infrastructure, Other) with the v2 dock's icon paths; every stock building names one and has a one-line description |
| web, Hangar | the part rail lists the parts scope only |
| `packages/renderer` | `building-thumbnail.ts`: the site generator of one building (`generate`, now exported from `site-list.ts`) drawn at 256 × 160 from a fixed three-quarter view; `thumbnailFraming` fits the bounding sphere; a promise cache by generator and footprint (a failed draw is not kept); one offscreen `WebGLRenderer`, one draw per frame, disposed when the queue is empty |
| `lib/space-center/build-menu.ts` | the menu model: categories in order, cards with cost, size in metres, build days, levels and capacity per level, the reason a card cannot be built (place, body, funds), buildable cards first; arrow-key stepping |
| `BuildMenu.svelte`, the overlay | the category bar at bottom 52 in the v2 dock style (64 × 56 targets, a 4 px dot on the open one), the card row above it with horizontal scroll and the pictures, the details popover on hover or focus, the reason under a disabled card; arrow keys on the bar and the row, ↑/↓ between them, Escape closes the row. Choosing a card starts the existing placement preview |
| tests | core `categories` (scope, fallback, the building fields), stock `categories` (the eight, every building in one), renderer `building-thumbnail` (size, framing, bounds, cache), web vitest `build-menu`; e2e `build-menu.e2e.ts`; `space-center.e2e.ts` opens Comms before the dish |

## Screenshots

- The Launch row open, the details of Launchpad M showing; Launchpad L disabled at the end with its funds reason: `assets/235-build-menu.jpg`
- The Comms row with the tracking dish's card and picture: `assets/235-build-menu-comms.jpg`

## What surprised me

- **One registry was enough.** Part categories already had ids, labels, icons, order and a mod registrar; a `scope` field kept mods on the API they know and needed no new registry, registrar or patch target.
- **Generators draw past their cells:** the hangar's apron reaches about 5 m beyond its door. The thumbnail frames the drawn box, so the picture is right; the renderer test's bounds check allows a cell.
- **The pads' pictures are plain** (a concrete deck): the thumbnail shows what the site draws. Plan 234's dish will bring a richer model to Comms.

## Decisions made (link ADRs)

- [ADR 0227](../decisions/0227-building-categories-and-build-menu.md): categories by scope in the one registry, the card facts and reasons, the thumbnail pass and the menu's behaviour.
- In the plan's Log: off-world kinds show at home as disabled cards rather than being hidden.

## Open questions / follow-ups

- Plan 234 (Worker C) names `stock.comms` for the deep-space dish; its card appears with no menu change.

## Verification output

```
bun run check:affected --build --e2e e2e/build-menu.e2e.ts (under /tmp/orbital-heavy.lock, Chromium, 1 worker)
  ✓ prettier (34 changed files) · ✓ docs:check · ✓ typecheck (11 workspaces) · ✓ typecheck (web)
  ✓ bun test (10 workspaces) · ✓ web vitest (related to the change)
  ✓ build · ✓ e2e e2e/build-menu.e2e.ts (chromium)
  check-affected: all passed in 560.9 s
bun run lint: all matched files use Prettier code style
core categories 11 pass · stock 128 pass · renderer building-thumbnail 4 pass · web build-menu 4 pass
e2e (Chromium): build-menu, space-center, base-layout: 6 passed
```
