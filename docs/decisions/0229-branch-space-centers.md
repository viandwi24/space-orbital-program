# 0229 — Branch space centers on the home planet

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/236-branch-space-centers.md
**Builds on:** ADR 0222 point 4 (branches linked into the network), ADR 0177 (site templates, `found-site`, ground shaped on load), ADR 0142 (sites and pads), ADR 0115 (placement), ADR 0123 (construction on the tick), ADR 0125 (off-world bases), ADR 0179 (ground stations), ADR 0150 (the Launch screen)

## Context

A world has its Space Center and, since plan 128, bases on other bodies. The owner wants agencies to open more space centers on the home planet and link them into the comms network. `found-site` exists in the sim but is free, instant and starts a site with a pad; nothing in the game sends it. The Launch screen launches from the first site only, and every site is a tier-1 ground station whether it has a dish or not.

## Decision

1. **A site kind, not a new shape.** `SITE_KINDS` gains `branch`. The plan's `hq | branch | off-world` maps onto the names already saved: `space-center` is the HQ and `base` is a site on another body. An old save has no branch, so no save migration is needed; the enum only grows.
2. **`found-branch`** (`{ id, name, latitude, longitude }`) founds a branch on the home body. It follows the site rules of `found-site`: an unused id, at most eight zones on the body, and no overlap with another site's flat zone and blend. The cost and build time come from data, not constants: the building that provides `branch-hq` (stock's `stock.branch-hq`, 250 000 funds and 20 days) is paid at level 1 (economy on, cost multiplier applied). The branch starts with that HQ in `building` state north of its centre, and the world tick finishes it like any construction.
3. **A branch builds nothing before its HQ.** `canPlace` takes `branch: true` for a branch site. Until a building that provides `branch-hq` is active, every other kind is refused with code `hq`: "The branch HQ is still under construction". A `branch-hq` building is never placed by hand: "comes with a new branch".
4. **Ground stations.** A branch is a ground station only while it has a working comms-node building, at that building's tier. The HQ and off-world bases keep their tier-1 default.
5. **The ground of a new branch.** A site's flat zone shapes the terrain only when the world is loaded (ADR 0177 point 6). The web therefore saves the world and reloads it right after a branch is founded, so the branch's ground, terrain and renderer zones are right before anything stands on it.
6. **Launch from any site.** The site placement gains `at: { east, north }`, metres from the site centre, used instead of a `pads` index. The Launch screen picks a site, then a working pad or runway at that site, and sends `{ kind: 'site', site, at }`. Fuel storage and the launch charge are therefore the chosen site's.
7. **The UI.**
   - The Space Center's "Found a branch" opens a map of the home planet (equirectangular, drawn from the terrain probe the site templates use). It marks sea, coast and land, and each existing site with the area a new zone may not enter.
   - A click shows the latitude, the terrain, what lies east, the rotation boost, the nearest site, and the cost and build time. Sea and overlapping spots are refused there with the sim's reasons.
   - The site switcher picks the shown site, and the status bar's location names it.
   - The 3D view still draws the HQ's site, so at a branch, as at a base, a chosen building goes to the first free cell near the centre.
   - The Mission Center lists the sites with their kind, place and ground-station state.

## Consequences

- Branch founding, its cost and its time are mod data: a mod can replace `stock.branch-hq` or add another `branch-hq` building.
- `found-site` keeps its meaning (a free base, used by tests and future tools); home-body sites it made before stay `base`.
- Placing a building at a branch from its own 3D view waits for a view that can centre on any home site.
