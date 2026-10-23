# 0335 — Engine plume templates: a propellant base and the engine's scales

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/400-engine-plumes-v2.md
**Builds on:** ADR 0330 point 3 (looks are built in, data is the mod's), ADR 0047 (effect techniques), ADR 0081 (clustered bells), ADR 0080 (exhaust trail ribbon)

## Decision

1. **A template is data on the plume.** `PartVisual.plume.template` (`plumeTemplateSchema`, core) names a **propellant base** (`kerolox`, `hydrolox`, `methalox`, `hypergolic`, `solid`, `ion`) and the engine's own scales: `lengthScale`, `widthScale` (0.25 to 4), `brightness` (0 to 4), `diamonds` (0 to 2), `chamberPressure` (bar, reference 60), and optional `color` and `core` overrides. An engine without a template draws as before; `plume.color` still sets the outer flame.
2. **The base owns the look.** Each base gives the outer, inner, core and nozzle-glow colours, how much of the core shows at sea level (hydrolox 0.18, so it is near invisible there and the diamonds carry it), and scales on length, width, emission and the diamonds. Solid also marks the smoke trail.
3. **Controllers drive the shape.** The length and width still come from the throttle and the isentropic expansion (`plumeShape`); the template then scales them by the base, the engine and the chamber pressure (`(bar/60)^0.25` on length, `^-0.12` on width), and the core's share rises to 1 as the air thins. The air density controller is `(p/p₀)^0.5128` by default; remap curves and the ignition ramp are pure functions for templates that need them.
4. **One light per cluster.** The engines of one vessel whose nozzles lie within 6 bell radii share one point light at their thrust-weighted centroid; its intensity is linear in their summed thrust (throttle × bell area × bells), capped. A fixed pool of three lights exists at Medium and High, so the light count never changes in flight; Low has none.
5. **Quality.** `PresetSettings.plume`: Low draws the inner flame and the nozzle glow only (no outer flame, no diamonds, no cluster light); Medium the outer flame, the diamonds and the cluster light; High is the level the volumetric layer will use. The level is a uniform of the existing shaders, so there are no new pipelines to warm.
6. **Not here.** The additive volumetric material with a depth fade, noise, the mesh set (cone, bell, billboard, diamond strip), LOD by screen size, and mod-supplied templates are left to the follow-up and to plan 405; the template schema leaves room for them.

## Consequences

- Every stock engine carries a template (a test pins it): kerolox for the LV-T30, KR-4, LB-1 and the F-1 plate, hydrolox for the vacuum engines and the orbiter's aft engines, methalox for the wide and plate engines, hypergolic for the landers, solid for every motor.
- `PLUME_PROPELLANTS` and `plumeTemplateSchema` are part of the SDK.
