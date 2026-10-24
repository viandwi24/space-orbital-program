# 0374 — The ground, the site and its vegetation see only the sun and the sky

**Status:** accepted
**Date:** 2026-10-25
**Plan:** plans/414-pad-at-120hz.md
**Builds on:** ADR 0373 (the site's lights are glow; a small fixed pool of lamps)

## Context

After ADR 0373 four pooled lamps remain in the scene (two vessel lamps, two plume cluster lights), at intensity 0 when unused. Every lit material loops over every light of the scene, so the site, the vegetation and the rocks paid for lamps that only ever light a vessel.

## Decision

1. **`material.lightsNode`**: in three 0.186's node materials a `lightsNode` replaces the scene's lights for that material. A classic material is converted to its node twin by copying its enumerable properties (`NodeLibrary.fromMaterial`), so setting `lightsNode` on the classic `MeshStandardMaterial` is enough; WebGL, which does not read it, keeps every light. The WebGPU renderer sets `lights([sun, hemisphere])` on the site's lit materials (buildings, vegetation, rocks, people) and on the ground rocks' material (`restrictLights`, `light-sets.ts`), once at its creation. The sun's shadow works as before (`414ls-pad-day.jpg`).
2. The set is fixed from the load: no program key changes in play (the dusk probe builds 0 pipelines).
3. Vessel and part materials keep every light, so the pool's lamps still light vessels; the planet and moon passes light themselves.

## Consequences

- Interleaved A/B on the M5, headed, the pad, four pairs against main with the glow (ADR 0373): mean frame 18.8, 16.2, 25.2, 24.4 ms against 15.2, 16.3, 23.5, 22.8: 21.2 against 19.5 ms (the second pair equal, the other three 1.6 to 3.6 ms lower; the last two pairs were in a slow stretch of the machine).
- A new lit material of the site must be listed in `LaunchSite.litMaterials` to be restricted; `light-sets.test.ts` fails if a material the site draws is missing.

## Addendum (plan 415): the moon and hills layers

`MoonTSL.layer()` gives each layer's material the same `lights([sun, hemisphere])` set (one per `MoonTSL`), so a moon or hills body does not loop over the vessels' pooled lamps either. `light-sets.test.ts` guards that the layer builder restricts its material. Checked: the dusk probe builds 0 pipelines (92 before, 92 after); the Cinder body from 3 km has the same mean brightness with and without the restriction (44.2 against 44.2, `414ml-cinder-3km.jpg`).
