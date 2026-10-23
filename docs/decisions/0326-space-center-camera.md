# 0326 — The Space Center's camera frames the whole site, then each building from its entrance

**Status:** accepted
**Date:** 2026-10-23
**Plan:** plans/387-space-center-camera-and-visual-qa.md
**Supersedes in part:** plan 259's framing (centre on the building and cap the distance at 160 m, keeping the current azimuth)
**Builds on:** ADR 0254 (the Space Center modes), ADR 0298 (the Buildings strip)

## Context

The Space Center opened on a fixed view near the centre. Selecting a building moved the focus but kept the camera's azimuth, so a building was often seen from behind or through another one.

## Decision

1. **The overview fits the site.**
   - The view holds every building and road of the current site, as boxes from the footprints and the generators' heights, inside the part of the screen the interface leaves free.
   - The angle is a three-quarter view at 40° from the site's front, which is the side most entrances face (the south when there are none).
   - At least 180 m of ground is framed, so a branch with only its HQ shows its land.
   - It is used on opening, on a site switch, back from a building, and when the Buildings strip opens or closes.
2. **A building's best view.**
   - The camera stands on the side the building's first entrance faces (from `entranceFronts`, so the rotation counts), at 32°, and fills about 55 % of the free view.
   - If another box stands between the camera and the building's middle, the camera walks round in 20° steps, alternating sides, to the nearest clear angle. If no angle is clear, it climbs to 52°, then 69°.
   - The elevation is always above the horizon.
3. **One flight.**
   - The renderer takes a compass view (`setSiteCamera`: focus, azimuth, elevation, distance), turns it into the rig in the camera frame, and eases there in about 0.6 s. Yaw takes the short way round and distance eases in log space.
   - With reduced motion it jumps.
   - The player's drag or wheel cancels the flight.
4. **The free view is measured.** The insets come from the drawn interface: the bars, the strip and bar at the bottom, and the building panel at the right. They are measured after the overlay has drawn.

## Consequences

- The math is pure and tested in `site-camera.ts`. The renderer only converts and eases.
- Pins and labels are projected from the same camera each frame, so they follow the flight.
