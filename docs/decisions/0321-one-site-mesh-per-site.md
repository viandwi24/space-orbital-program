# 0321 — Every home site's buildings are drawn at their own place

**Status:** accepted
**Date:** 2026-10-23
**Plan:** plans/384-one-site-mesh-per-site.md
**Builds on:** ADR 0117 (site mode), ADR 0229 (branch space centers), ADR 0290 (the world's shared renderer)

## Context

The renderer had one `LaunchSite`, at the primary site. A branch's buildings were drawn on the HQ's ground in the Space Center, and nowhere in Flight. A vessel launched from a branch stood on flat, bare ground.

The terrain was already right, because every site's flat zone is baked. The system audit's option (a) would have moved the one site with `Environment.setSite`, but that also moves the HQ's flat zone in the renderer's terrain copy. The owner chose option (b): one site mesh per site.

## Decision

1. **`SiteBuildings`, split out of `LaunchSite`.** It is one site's list buildings, roads, deep-space dishes and the build ghost, in site-local metres, placed on the turning body. It does not make its own materials; it draws with the materials it is given.
2. **The HQ keeps its `LaunchSite`** (vegetation, people, floodlights, steam, the pad tower), which holds one `SiteBuildings`.
3. **Every other home site gets only a `SiteBuildings`.** It shares the HQ's material instances, so a branch adds no shader program and no WebGPU pipeline, and showing one mid-flight compiles nothing (plans 370 and 373). A branch gets no point lights: a change in light count recompiles every lit material in WebGL.
4. **API (additive):**
   - `setSiteBuildings(list, roads, site?)` and `setSiteView(on, site?)`, with `site = { id, latitude, longitude }`. Absent means the primary site.
   - A site whose coordinates are the primary's is the primary.
   - The site the view is on is where the camera looks, and what `pickSite`, `projectSite` and `setSiteGhost` use.
5. **Hosts:**
   - Flight sends every home site's buildings.
   - The Space Center sends the selected home site's buildings and view.
   - A base on another body keeps the primary's view (ADR 0125 point 7).

## Consequences

- A branch looks like a working site from the pad and from orbit, but without the HQ's dressing. Dressing a branch is a later plan if wanted.
- A branch founded during the session is drawn as soon as its buildings arrive; its ground is flat after the world is loaded again (unchanged).
