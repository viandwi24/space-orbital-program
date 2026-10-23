# 0319 — Small-body terrain and body names on the map

**Status:** accepted
**Date:** 2026-10-23
**Plan:** plans/382-small-body-terrain-and-map-body-labels.md
**Builds on:** ADR 0067 (terrain kind per body), ADR 0054 (the moon pass), ADR 0318 (the wider stock system), ADR 0158 (the Network layer)

## Context

Plan 381 gave the stock system three rocks of 7 to 13 km: Mote, Flick and Vagrant. They use `craters`, whose scales are in kilometres: lattices of 70 km down to 1.3 km, and a landing plain of 10 to 42 km of arc round +X. A 7 km radius has an arc of 22 km all round, so the rocks are one flat plain at the base level: no relief and no craters except at the far side. The map names only vessels and the comms stations, and the home Space Center's name shows from anywhere in the system.

## Decision

1. **`terrain: { kind: 'craters', small: true }`** (optional flag, API 0.1.114). A flag rather than a new kind: the crater profile, the lattice and the seed are the same function, only the scales change. It is not inferred from the radius, so the data says what the body is.
2. **The small shape** (`SMALL_SHAPE` in core `moon-terrain.ts`): no landing plain; the five crater lattices keep their salts, radius shares and profile but their cells are shares of the radius (0.9, 0.5, 0.28, 0.15, 0.08 radii); two octaves of value noise (0.16 R over 1.5 R, 0.05 R over 0.6 R) make it lumpy; the level is 0.24 R above the reference sphere; every height is clamped to `[0, 0.6 R]`, which is also the field's `maxHeight`. The shape is the same at any radius (a body twice as large is the same rock twice as large).
3. **The renderers follow by a uniform.** The GLSL moon pass gets `uSmall` (0 or 1): the cell edge, the relief and the lumps are `mix`es and an `if` on it, so a small body runs the same program as any craters body and no new shader variant is built (Windows compile time, plan 370). The TSL pass builds its graph with the radius and seed already inlined (ADR 0318), so it picks the small graph at build time; it is one more graph only for bodies that are small. `MoonPass.groundHeight` (the CPU twin the camera and shadows use) calls core's function.
4. **The sim needs nothing but the field**: `createBodyTerrainField` passes `small`; the stones, the ground tile and the rails read the field as before.
5. **Body names on the map.** `FrameData.bodyLabels`: each snapshot body is projected (centre and disc radius in px), the names are placed under the discs biggest body first, and one that is off screen, behind another body, wider than 45 % of the view's short side, or overlapping a placed name is left out until the player zooms in. The map's Labels filter hides them with the apsis names. The names come from `bodyLabel`.
6. **The Space Center's name needs Home to be near.** A station's name is drawn only when its body's disc is at least 40 px in radius; the marker stays. In the overview Home is a dot, in orbit round Home it is large.

## Alternatives considered

- **A new terrain kind (`asteroid`).** Another kind is another GLSL/TSL branch and another schema member for the same crater maths.
- **Scale by radius automatically below some size.** Hidden coupling between a body's size and its ground; a mod with a 30 km moon that wants the plain could not have it.
- **Ellipsoid shape from the three axes.** The sim and renderers read one scalar height along a direction; lumps of that field give the irregular outline at no cost to either.
- **Names as 3D sprites in the renderer.** The map's other markers are HTML over the canvas, where the text is crisp and the declutter is simple.

## Consequences

- API 0.1.114, additive: a body without `small` is unchanged.
- The three stock rocks change their ground: heights of about 0.1 to 0.4 R over the reference sphere, so a landed vessel sits on a lumpy surface; slopes stay under 0.5 (tests).
- Saves do not store terrain, so old saves with the rocks land on the new ground; a vessel landed on Mote, Flick or Vagrant in a save made before this is placed by its stored position and may be inside or above the new ground until it settles.
