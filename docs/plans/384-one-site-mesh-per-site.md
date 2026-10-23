---
id: 384
title: "The renderer draws every home site's buildings at its own place"
status: done
owner: "system audit session (Claude, 2026-10-23)"
depends: [236, 248, 340]
phase: 7
created: 2026-10-23
updated: 2026-10-23
---

# 384 — One site mesh per site

## Goal

Design question D5 of `docs/research/system-audit-2026-10.md`, approved by the owner on 2026-10-23 (option (b)). Today the renderer knows only one site, the primary one. This causes two problems:
- **Flight from a branch:** the vessel stands on flat but bare ground, with no pad and no buildings.
- **Space Center with a branch selected:** the branch's buildings are drawn on the HQ's ground.

Every space center on the home planet should be drawn where it is.

## Context

- ADR 0321 (this plan's decision), ADR 0117 (site mode), ADR 0229 (branches), ADR 0290 (the world's shared renderer).
- `packages/renderer/src/site-meshes.ts` (`LaunchSite`), `environment.ts`, `scene.ts`, `renderer-facade.ts`.
- `apps/web/src/lib/flight-loop.ts` (`showSite`), `lib/space-center/space-center-loop.ts`, `routes/(world)/space-center/+page.svelte`.
- The pipeline rules of plans 370 and 373: nothing may be first drawn mid-flight with a new material.

## Scope

**In:**
- `SiteBuildings`, split out of `LaunchSite`, holds a site's list buildings, roads, deep-space dishes and the build ghost:
  - it is drawn with materials it is given;
  - the HQ's `LaunchSite` keeps one;
  - each other site on the home body gets one, using the HQ's material instances, so no new programs or pipelines.
- `Renderer.setSiteBuildings(list, roads, site?)` and `Renderer.setSiteView(on, site?)`, with `site = { id, latitude, longitude }`; absent means the primary site:
  - the camera, `pickSite`, `projectSite` and the ghost follow the site the view is on.
- Flight draws every home site's buildings. The Space Center draws the selected site at its own place and looks at it.

**Out:**
- The HQ's dressing at a branch (vegetation, people, floodlights, steam, the hard-coded pad tower). Lights would recompile the lit materials in WebGL.
- Bases on other bodies (ADR 0125 point 7 keeps their view).
- The renderer's terrain zones, which are already flat at every site.

## Acceptance criteria

- [x] A unit test: `SiteBuildings` for a branch shares the HQ's material instances and stands at the branch's latitude and longitude.
- [x] A unit test: with a branch view, `pickSite` and `projectSite` answer in the branch's metres.
- [x] The web: Flight sends every home site's buildings, each with its place, and the Space Center sends the selected site's place; model tests.
- [x] `bun run typecheck`, the renderer and web tests pass (renderer 817, svelte-check clean).

## Docs checklist

- [x] `docs/STATUS.md` (the stale "draws the HQ's site only" line)
- [x] ADR 0321 and its index row
- [x] Journal `384-one-site-mesh-per-site.md`

## Log

- 2026-10-23: Written for D5 of the system audit.
- 2026-10-23: Done. See the journal; flying from a UI-founded branch is not checked by hand.
