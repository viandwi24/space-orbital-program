# 0047 — glTF asset provider, shard debris, lit smoke, plume ground light, plasma colour

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/033-part-assets-effects-and-aero-follow-ups.md

## Context

ADR 0028 left room for an asset-backed `PartModelProvider` and the look blockers of journal 026: smoke is small flat billboards, debris is boxes, the plasma is one tint, the plume lights nothing. ADR 0025 sets the bar. Constraints: no cost added to the pad scene (plan 039 is cutting the frame budget), everything testable in Bun without a GPU, no new dependency.

## Decision

1. **Asset provider.** `GltfPartProvider` (renderer, `three/addons` `GLTFLoader`, already part of `three`): claims a request whose `visual.kind` is `model` and whose `visual.params.url` is a string (params already allow strings). `preload(definitions)` fetches and `parse`s each model once (a failure is recorded and the provider declines, so the procedural generator for the part's `fallbackKind` param, or the shape provider, builds it); `create` clones the parsed scene (shared geometry, materials from the file) into a `PartModel` with the bounds from the file and nodes from the request. Not in this plan: KTX2/Draco decoders (no asset needs them yet; the loader accepts them when attached), a bundled asset (stock stays procedural), an LOD scheme.
2. **Debris from real meshes.** An explosion's shards are triangles sampled from the exploded part models' own geometry (`shardsFromGeometry`: area-weighted triangle choice, a thin prism of the triangle's size in the part's material colour), falling back to the old boxes without a model. A shard keeps its triangle's colour so burning paint, foil and metal read as such.
3. **Lit smoke.** The smoke billboards are shaded as sphere impostors lit by the sun and the environment light already passed to the effects (`EffectsFrame.light`) with a darker underside, drift with the wind (a per-body horizontal vector from altitude, deterministic), and take their colour from the ground under the engine (dust: sand over land, white spray over water by the terrain height sign) via `dustColour`. No depth texture is read (soft particles need one; the transparent pass has none and adding it is a frame-budget cost for plan 039 to weigh).
4. **Plume ground light.** One additive disc on the ground under an engine near the surface: its radius and intensity follow `plumeGroundLight(height, throttle, thrust)` (inverse-square-like falloff, zero above 6 nozzle lengths); one draw call per lit engine group (at most 4), no scene light, so no shader cost for every material.
5. **Plasma colour.** `ionisationColour(speed)`: orange-white below 6 km/s going through magenta-white to blue-white above 9 km/s (real air chemistry at those speeds), applied to the existing plasma shell tint. The bow-shock-from-silhouette shape and the comms blackout hook are not in this plan (draft 040).

## Alternatives considered

- **A point light for the plume.** Real lighting of the vessel and ground, but every lit material pays for it in every pass.
- **Shards as pre-authored convex pieces.** Cheaper; no relation to the part that broke.
- **Loading assets in the sim host.** The renderer owns Three; the provider API already has `preload`.

## Consequences

- Hosts may put `GltfPartProvider` in `partProviders`; stock keeps procedural parts, so nothing loads by default.
- Smoke costs the same particles with a heavier fragment shader (no extra draw calls); measured in the journal.
