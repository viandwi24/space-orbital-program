# 0329 — Graphics that never hang the load, a branch's ground and buildings, a camera that turns with the site

**Status:** accepted
**Date:** 2026-10-23
**Plan:** plans/388-space-center-qa-leftovers.md
**Builds on:** ADR 0249 (the WebGPU and WebGL renderers), ADR 0308 (the loading screen and its log), ADR 0321 (one site mesh per site), ADR 0326 (the Space Center camera)

## Context

Plan 387's visual QA pass found the following problems:

- With software rendering, the loading screen never left "Starting the graphics".
- A branch's ground showed a square grid in its snow and sand.
- A branch HQ under construction looked finished.
- The Build bar covered the lower third of the site.

Checking the night across a time warp found one more: the site turned on screen while the warp ran.

## Decision

1. **Starting the graphics has deadlines.**
   - `requestAdapter()` has 4 s to answer. After that the game draws with WebGL. On SwiftShader it never answers.
   - The planet-map store has 3 s.
   - If WebGPU is still on "Starting the graphics" after 20 s, the tab reloads once on WebGL. This also covers three's own `init()` hanging. The fallback is kept in `sessionStorage` (`orbital.graphics.fallback`) and does not change the player's choice.
   - If WebGL does not start either, the loading screen says the graphics are unavailable. It also shows four tips and a Reload button. The same happens when the fallback was already tried, or when `?renderer=` asks for a backend.
   - A WebGL renderer that exists is never given up on. Software GL blocks the page while it bakes.
   - "Continue with lower quality" saves the low preset even before the renderer exists. During this step it also leaves WebGPU at once.
2. **A branch's ground is a site's.**
   - The planet pass measures its site distance to the nearer of two places: the launch site, and the branch in view (`uSiteToOther`).
   - So the 256 m field cells, the hill relief and the rivers stay out of the ground round a branch, as they do round the HQ.
   - The ground detail of plan 364 fades out by its own mip level, from 3.5 to 5.5. Past that a tile is a few texels, and it repeats as a grid.
3. **A building under construction is a building site.**
   - Its finished shape is drawn faint.
   - A scaffold stands round its footprint up to its height, with an orange top rail.
   - A concrete core rises with the share of days built, in twentieths.
   - A planned building is shown at 0. An upgrade keeps the building standing.
4. **The Space Center camera's frame is the site's own axes.** These are east, up and south, turned with the body. It is no longer the flight "Free" frame, which keeps an inertial heading. A time warp no longer spins the site. Compass views (ADR 0326) were already measured on those axes.
5. **The Build bar is compact.**
   - The cards are one short row, with the picture beside the name.
   - A chevron folds the cards away.
   - The levels panel sits at the bar's right end.
   - Opening or folding the bar re-frames the site above it, as the strip does.

## Consequences

- A machine on software rendering loads in about a minute on WebGL instead of never. A machine with no usable graphics gets told so, with tips, after about 20 s.
- `SiteBuildingView.construction` is new (renderer, internal).
- `PlanetPass.setOtherSite` is new. `Environment.setViewSite` calls it.
- The detail texture shows less at a distance. Rock and snow keep it out to a footprint of about 0.5 m, where it was 8 m before.
