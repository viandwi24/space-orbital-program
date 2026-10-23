# 384 — One site mesh per site

**Plan:** [plans/384-one-site-mesh-per-site.md](../plans/384-one-site-mesh-per-site.md) · **ADR:** [0321](../decisions/0321-one-site-mesh-per-site.md) · **Session:** system audit session (Claude), 2026-10-23

## What was done

| Where | What |
|---|---|
| `site-meshes.ts` | `SiteBuildings` split out of `LaunchSite`: list buildings, roads, deep-space dishes, the ghost, picking and `siteToWorld`, drawn with given materials. `LaunchSite` holds one at its origin and exposes `sharedMaterials`. |
| `environment.ts` | `otherSite(id, lat, lon)` makes a branch's `SiteBuildings` with the HQ's materials; every frame places each one and sets its dish distance and tracking. `setViewSite` and `viewBuildings` say which site the picks and the ghost use. |
| `scene.ts`, `renderer.ts`, `renderer-facade.ts` | `setSiteBuildings(list, roads, site?)` and `setSiteView(on, site?)`. A site at the primary's coordinates is the primary. The camera centre, `pickSite`, `projectSite`, `setSiteFocus` and the ghost follow the viewed site. `resetView` goes back to the primary. |
| web `site-views.ts` | `homeSiteDraws` (every home site's views, roads and place) and `sitePlace`. |
| `flight-loop.ts`, Flight page | Flight draws every home site's buildings at its own place (`sites` option). |
| `space-center-loop.ts`, Space Center page | `setBuildings(draws, view)`: every home site drawn, and the view on the selected one. Redrawn on a site switch. |

## Surprises

- Unit tests that read `projectSite` after `sync` alone pass for the primary only by chance: the floating origin sits at the HQ, and nothing places the site roots until `prepareFrame`. The branch test calls `prepareFrame`.
- Every site's flat zone is at height 0 (`terrain.ts`, ADR 0142 point 3), so a branch's buildings stand at the body radius like the HQ's. A spot without a zone (a dev-console test) shows them buried in hills.

## Checks

- Renderer suite 817 pass (new: `site-others.test.ts`, and two branch-view tests in `site-list.test.ts`). The web `site-views` tests pass, and svelte-check is clean.
- In the browser (dev, WebGPU), from the console: a branch 2.4 km north drew its hangar and pad there, the view went to it, and `setSiteView(true)` came back to the HQ with its pins aligned. The `twins.ts` TSL errors in the console are the known pre-existing ones.
- Not done: founding a branch through the UI and flying from it (the map pick needs a hand).
