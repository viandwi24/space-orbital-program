# 0296 — Mod overlays: world-space shapes as data, drawn by the renderer; Trajectories as the built-in example

**Status:** accepted (owner's request, 2026-10-22)
**Date:** 2026-10-22
**Plan:** plans/347-mod-overlays-and-trajectories.md
**Amends:** ADR 0292 (World API), ADR 0149 (panels)

## Context

The owner wants KSP's Trajectories as a mod: a predicted path from the vessel to a cross-hair on the ground. Mods may not import three.js (boundaries.md) and run in the sim Worker or as pure page functions. The prediction needs drag, so it needs the air, the vessel's mass and drag area, the body's spin and the ground height, none of which mods could read.

## Decision

1. **Shapes are data.** `OverlayShape` is a `polyline` (points, colour, width 1–8 px, optional dash in metres), a `marker` (`cross`, `ring`, `dot`, `target`; size 6–64 px) or a `label` (text up to 40 characters). Each names a `body` and a `frame`: `inertial` (offsets from the body centre in the shared inertial axes, like vessel positions) or `body-fixed` (turning with the body, for ground points). Options: `depth` (`test` or `on-top`, the default), `views` (`flight`, `map`), `vessel` (shown only while the player flies that vessel). Colours are `#rrggbb` or `#rrggbbaa`.
2. **Budgets.** Per overlay at most 64 shapes, 4 096 points in all and 16 labels; `clampOverlay` drops the excess and says what it dropped. Invalid shapes are dropped, not thrown.
3. **Two producers, one registry.** `defineOverlay({ id, title, description?, defaultOn, rate?, draw? })` (registry `overlays`). A page-side `draw(input)` runs at `rate` (1–30 Hz, default 10) with the panel input and `input.world`. A sim system publishes with `ctx.overlays.set(id, shapes, meta?)` / `clear(id)` for its own plugin's overlays only; the snapshot carries them as `overlays` (never saved). `meta` is a small record of numbers and strings for the mod's panel (`input.world.overlay(id)`).
4. **The renderer owns the meshes.** `Renderer.setOverlays(layers)` builds fat lines (`LineSegments2` with `LineMaterial`, which has a WebGPU twin), glyph markers re-sized each frame to their pixel size, and sprite labels at a constant pixel size; `on-top` draws without the depth test, after the scene.
5. **Toggles.** Settings → Overlays lists every overlay with a switch; `defaultOn` sets the first state. Hidden overlays are not evaluated.
6. **Facts for physics mods.** Atmosphere (`ambientAt`, `machDragFactor`) moves to core and the query exposes `atmosphere(body, altitude)`; `VesselSnapshot.aero { mass, dragArea }` (the drag area is the measured C_d·A along the airflow while in air, else an estimate along the vessel's axis); `WorldBody.angularVelocity`; `WorldQuery.groundHeight(body, position)` (the sim's terrain in the sim, null on the page).
7. **Trajectories (`mods/trajectories`)**, built in and on by default: a sim system predicts, five times a second, each flying or sub-orbital vessel of the player (four at most) with RK4 in the inertial frame, drag in the air that turns with the body, coasting (no thrust), until the ground, the SOI edge or 30 minutes; it publishes the arc and the impact cross-hair in the body-fixed frame, and a panel shows time, distance and speed at impact. A landing target (a store) is set at the predicted impact from the panel; the overlay draws it with the error.
8. API 0.1.107, additions only.

## Consequences

- The range-safety drop stays a vacuum conic (it judges a stage far ahead, cheaply); Trajectories integrates with drag.
- Predicting in the sim builds a full snapshot five times a second while a vessel flies (the world query); measured below a millisecond.
