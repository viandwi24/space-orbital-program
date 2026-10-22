# 0298 — The Space Center's Buildings list is a strip of cards along the bottom

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/349-space-center-buildings-strip.md
**Supersedes in part:** ADR 0254 point 2 (the Buildings list as a 280-wide panel at the right)
**Builds on:** ADR 0227 (the build menu and its thumbnails), ADR 0254 (the modes), plan 259 (framing)

## Context

The Buildings list sat in the top-right corner as a column of names, far from the bar that opens it. The owner asked for it to look like the Build menu: a wide strip at the bottom with a picture for each building.

## Decision

1. **Place.** In Overview, Buildings opens a strip 8 px above the bar. It uses the build bar's glass, radius and width (up to 1040, less on narrow windows). The corner panel goes. The strip stays mounted while closed, as the list did.
2. **The header** holds BUILDINGS, the count, and the attention line ("Every building is running." or the warnings in amber). Flows and Market are toggles that open their lines under the header. The site picker is there when the world has more than one site.
3. **The cards** are the build menu's cards:
   - the building's thumbnail, from the same renderer queue as the build menu, or a building icon;
   - a status chip: running in green, building or upgrading in amber, or planned;
   - the name, and "Level n of m" (or the status words while work runs);
   - a progress bar while it is built or upgraded.
   The progress is worked out from the days left and the level's build days, since the save keeps no start day.
4. **Hover, click, keys.**
   - Hovering a card shows the building's name label in the scene and boxes the building in white. This uses the same ghost box as the demolish tint, which stays red.
   - A click selects the building. That frames the camera and opens its panel (Focus).
   - Back in Overview the strip is still open.
   - The arrow keys, Home and End step through the cards. The cards scroll sideways when there are many.

## Consequences

- The tests and e2e specs keep the old test ids. The base-layout e2e now expects the strip above the bar instead of the panel at the right.
