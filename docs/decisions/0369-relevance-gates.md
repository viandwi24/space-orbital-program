# 0369 — Relevance: each look is paid for only where the view can show it

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/410-pay-only-for-what-the-view-needs.md
**Builds on:** ADR 0310 (no shader builds in play), ADR 0364 (the gates of plans 403 to 406), ADR 0367

## Context

The looks of the graphics wave (clouds v2, the sea v2, rocks, plumes, re-entry, orbital bakes) are measured on the M5 at 120 Hz, but the owner's M2 and Windows machines stalled and stuttered. Plan 408 removed the stalls. This plan decides what each look may cost, by view.

## Decision

1. **A relevance level per look** (`relevance.ts`): `relevanceOf(look, input)` returns 0 (off, or only a baked stand-in), 1 (cheap) or 2 (full) from the camera's altitude, the atmosphere, the vessel's state (none, landed, flying, orbiting), the map view, a screen share and heating. It is pure and tested by scene (pad, 3 km, 12 km, 40 km, orbit, map). The starting thresholds: the sea full below 3 km and analytic below 30 km; the volumetric clouds full below 15 km and cheap to the top of the air; rocks below 150 m (all below 40 m); the mesh terrain (plan 398) below 20 km; a plume with a vessel and a share of the screen; the plasma shell only while heating and not landed.
2. **Applied only through uniforms and branches, never pipelines.** The planet pass has three gates (`uGateOcean`, `uGateClouds`, `uGateTerrain`) that skip the sea's wave gradient and ripples, the cloud march and the terrain march at run time; `Environment` sets them each frame from the levels (sea and clouds off where the level is 0, which is the map view and, for the sea, above 30 km). The existing footprint tests (a pixel wider than 120 m has no wave gradient, 400 m no ripple) stay: they are the same rule at pixel level.
3. **The measuring tool uses the same switches**: `debug.setLookOff('ocean' | 'clouds' | 'terrain', off)` forces a gate off whatever the level says, so the cost of a look is its frame with the switch on minus off, on one page. `debug.lookCosts()` returns each look's level (and its ms where a pass measures it) for the Debug panel.
4. **Nothing compiles in play.** The Debug counter of pipelines built after the loading screen reads 0 in the measured runs (ADR 0367 moved the warm-up onto the loading screen; ADR 0359 kept pipelines alive); `measure-long-frames.ts` prints it.
5. **The device asks for what it has** (a second line of defence beside plan 412's packing, ADR 0368) (`device-limits.ts`): up to 32 sampled textures per shader stage where the adapter offers more than WebGPU's default 16. A planet shadow pipeline with a mod planet's images and the looks' maps in it needs 17, failed to build at the default and left the sea's edge and the shadows missing, found when the cost table of the mod-planet scenes printed the errors.

## Consequences

- In orbit and in the Space Center the three looks cost nothing measurable (within noise of 2 to 2.8 ms of GPU time for the whole planet pass in orbit); near the ground they cost what they cost (clouds 2 to 4 ms, the terrain march about 2.5 ms, the sea within noise): the lever for the weak machines there is the tier's preset and the governor, not a gate.
- Plume, rocks and plasma levels are computed; their gates (a far-engine sprite, a built-cell budget, the shell's draw) stay with their own plans (400, 402, 399) and move onto this model as they are touched.
