# 0117 — The Space Center view: the renderer's site mode, picking on the site plane, and where buildings persist

**Status:** accepted
**Date:** 2026-10-17
**Plan:** [091](../plans/091-space-center-3d-and-grid-placement.md)
**Builds on:** ADR 0097 point 3, ADR 0115 (grid), ADR 0030 and 0073 (procedural site), ADR 0107 (refs UI), ADR 0143 (worlds in the client)

## Context

Plan 091 shows a world's site in 3D from its building list, with labels, a build mode and navigation. The renderer had no site API: its camera orbits a vessel (with none, the floating origin and the camera fall back to the planet centre), the site scenery is built once from a hard-coded layout, and nothing projects or picks site positions. Placed buildings live in the sim's `WorldInfo.sites` (ADR 0115), which only a save carries.

## Decision

1. **Site mode of the renderer.** `createRenderer({ siteBuildings: true })` makes `LaunchSite` skip its hard-coded office, hangar, garage and control boxes and draw a **building group** from a list instead (`Renderer.setSiteBuildings(list, roads)`): one procedural generator per `visual.generator` (`launch-pad`, `hangar`, `control`, `office`, `runway`, `dish`, `tanks`, a plain block for unknown ones), sized from the footprint, merged per material, rebuilt when the list changes. The tower, masts, props and vegetation of today's site stay. The flight view keeps the old layout until the flight page also feeds the list.
2. **Site view camera.** `Renderer.setSiteView(true)` puts a virtual vessel (no parts) at the site centre for `Scene.sync`: the floating origin, the camera target, the camera's up (the site normal) and the ground clamp then work as for a vessel on the pad, with the orbit rig's own limits (`SITE_RIG_LIMITS`, 40 to 2 500 m).
3. **Picking and labels** work in the site's local frame (x east, y up, z south): `pickSite(x, y)` intersects the camera ray through a CSS pixel with the plane y = 0 and returns `{ east, north }` in metres; `projectSite({ east, north, up })` returns the CSS pixel of a site point or null when it is behind the camera. The ghost of build mode is `setSiteGhost({ size, cell, rotation, valid } | null)`, a translucent box in the valid or invalid colour.
4. **The page owns the rules.** The Space Center page loads the plugins on the main thread (as the VAB does) and checks a ghost with core's `canPlace`, the same function the sim runs for `place-building`; the reasons it shows are the sim's.
5. **Persistence until saves include the Space Center:** after a building is placed or removed, the page writes the site list into the world record's `world` (`Worlds.setSites`); new flights start from it (`startInfo`, which now also returns it for the Legacy world once it has one). A flight loaded from a save keeps the sites that save was written with. Saving the Space Center itself is left to plan 094 (launch screen) and 096 (construction).

## Consequences

- Entering a world opens `/space-center`; the Hangar's label opens the VAB, the Mission Center's is disabled until plan 113, the launchpads' until 094.
- 096 adds costs and construction time behind the same `place-building`; 094 sends a flight from a pad.
