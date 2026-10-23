---
id: 382
title: "Small-body terrain, and body names on the map"
status: done
owner: "small-bodies session (Claude, 2026-10-23)"
depends: [381]
phase: 8
created: 2026-10-23
updated: 2026-10-23
---

# 382 — Small-body terrain, and body names on the map

## Goal

Two follow-ups of plan 381 (the wider stock system):

1. Mote, Flick and Vagrant (7 to 13 km) have no visible relief. The `craters` height function keeps a 10 to 42 km landing plain at +X, and its crater lattices run from 70 km down to 1.3 km, so on a 7 km rock everything is plain. They need an irregular, lumpy shape and craters scaled to the radius.
2. The map draws no names for bodies. The home Space Center label (a comms ground station) shows from anywhere in the system.

## Context

- ADR 0319 (this plan), ADR 0067 (terrain kind per body), ADR 0054 (the moon pass), ADR 0318 and plan 381 (the bodies).
- `packages/core/src/moon-terrain.ts`, `body-terrain.ts`, `renderer/src/shaders/moon.glsl.ts`, `renderer/src/tsl/moon.ts`, `renderer/src/moon.ts`.
- `apps/web/src/lib/hud-controller.ts` (`frame()`), `comms/network-model.ts`, `map/body-labels.ts`.

## Scope

**In:** `terrain.small` on a craters body (API 0.1.114); the height in core, both moon passes and the sim; the three stock rocks use it; body name labels in the map (the Labels filter hides them); the Space Center name only when Home is big on screen.

**Out:** an elongated (non-spherical-at-low-order) shape; terrain shadows tuned for the rocks; names of vessels or sites other than the comms stations.

## Steps

1. Plan, ADR 0319.
2. `SMALL_SHAPE` and `moonHeight(…, small)` in core, `createBodyTerrainField`, the schema.
3. The GLSL twin by a uniform (`uSmall`, no new program) and the TSL twin; `MoonPass.small`; the scene passes it.
4. Stock: Mote, Flick, Vagrant set `small: true`.
5. Map labels: `projectBodies`, `placeBodyLabels`, `BodyLabels.svelte`, the station gate.
6. Tests, screenshots on WebGPU and WebGL, docs, push.

## Acceptance criteria

- [x] A 9 km body has relief everywhere (core test), its heights lie in `[0, 0.6 R]`, the shape scales with the radius.
- [x] The renderer's CPU twin (`MoonPass.groundHeight`) equals core; the GLSL carries the same constants; a lander rests on the small body's ground in the sim.
- [x] Screenshots of stock.mote, flick and vagrant before and after on WebGPU and WebGL show the same lumpy silhouette and craters.
- [x] In the system overview the bodies carry names that do not cover each other; the Space Center name is hidden there and shown when Home fills a good part of the view.
- [x] `bun run docs:check`, `bun test`, `bun run typecheck`, unit tests of `apps/web` pass.

## Docs checklist

STATUS row, journal 382, ADR index, `guides/writing-a-mod.md` (the `small` flag), glossary not needed.

## Log

- 2026-10-23: started from plan 381's follow-up list.
- 2026-10-23: done. Evidence in journal 382. The overview names 5 of 15 bodies by default (the rest on zooming); GPU readback of the small field not done.
