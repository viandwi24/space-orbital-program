# 0182 — Buoyancy: where the water is, the seabed, sliced volumes, water drag and impacts

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 067
**Builds on:** ADR 0019 (ground tile, impact damage), 0043 (terrain height function), 0072 (lakes are solid like the sea), 0024 (rest and surface rails), 0178 (the splashed situation), 0113 (recovery).

## Context

The sea and the lakes are terrain of height exactly 0, and the ground tile stands on them, so every vessel lands on water as on concrete. Plan 067 makes water displaceable. Open: where the water is as data, what is under it, how much of a part is under water, which forces act, how a floating vessel comes to rest, what an impact on water does, and how splashed is decided.

## Decision

1. **Where the water is.** `TerrainField.waterAt?(direction)` (core, optional) is true on the sea and on lakes:
   - the sea is where the warped biome map elevation is under `SEA_LEVEL`, the same map and coordinates the height function reads;
   - lakes are `isLake`.

   The `hills` field implements it. Craters and the smooth sphere have no water. The water plane is the reference sphere (height 0), where the height function already puts both.
2. **The seabed.** When the ground under a vessel's centre of mass is water, its ground tile's top face lies `WATER_DEPTH` (30 m) under the water plane, normal radial. A vessel that sinks rests there.
3. **Volume by slices.** Each part's `shape` gives its volume: a cylinder `πr²h`, a box `w·h·d`. The part is cut into 6 slices along its axis (local +Y). A slice at depth `d` (positive below the plane) is wet by the fraction `clamp(0.5 + d / e, 0, 1)`. `e` is the slice's vertical extent: `|a_y| · h/6 + (1 − a_y²)^½ · w`, where `a_y` is the axis's vertical component and `w` the cross-section width. So an upright part fills from the bottom, and a lying one by its width.
4. **Forces.** At each wet slice the sim applies:
   - buoyancy `ρ_w g (V/6) f` up, with `ρ_w = 1000 kg/m³` and `g` the local gravity;
   - water drag `−f ρ_w (V/6) (0.8 v + 0.5 |v| v)`, where `v` is the slice's velocity relative to the turning water.

   Both act at the slice's centre, so the torques right or tip the vessel by its shape. Only vessels within 200 m of the water plane over water pay for it.
5. **Wet counts as landed.** A vessel with any wet slice is `landed` after the step. The rest logic of ADR 0024 takes a floating vessel that has stopped moving to surface rails, so a floating capsule no longer blocks time warp, and it can be recovered (`recover-vessel` already says "landed or splashed").
6. **Impacts on water.** A part that becomes wet in a step, from dry the step before, is checked with the ground rule of ADR 0019. Its speed is the closing speed of its lowest slice along the water normal, times `WATER_IMPACT_FACTOR` (0.5). Parts wet at load or resume are never new.
7. **Splashed (ADR 0178 point 1).** A landed vessel whose centre of mass is over water (`waterAt`) is `splashed`, replacing "terrain below sea level".
8. **Stock.** A flotation collar: a 1.25 m radial ring, 0.6 m tall, 40 kg, about 2.9 m³ of buoyancy.

## Alternatives considered

- **An exact submerged volume of a tilted cylinder:** rejected. It has no closed form, and six slices give a righting moment that a test can measure.
- **Removing the tile over water:** rejected. A sinking vessel would fall to the centre of the planet; the seabed is where a sunk stage lies, and where range safety (127) puts it.
- **New part fields for volume or flotation:** rejected. The shape already says how much water a part displaces, and a collar is just a light, wide part.

## Consequences

- **Mod API:** `TerrainField.waterAt` (optional), water constants (`WATER_DENSITY`, `WATER_DEPTH`, `WATER_IMPACT_FACTOR`); additive, `API_VERSION` patch bump.
- **Behaviour:** a vessel over the sea or a lake no longer lands on a solid surface. A dense stack sinks to 30 m, and a capsule floats. Worlds created without a terrain field (the sim's default, and most tests) have no water and do not change.
- **Follow-ups:** 193 (ripples and splash), 127 (impact classification with `waterAt`), waves.
