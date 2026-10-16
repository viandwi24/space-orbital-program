# 0058 — Light and dust on an airless body

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/049-moon-polish.md
**Builds on:** ADR 0027 (environment light), 0028 and 0047 (effects), 0054 (moon pass).

## Context

On the moon (plan 044) the vessel rendered almost black (`journal/assets/044-moon-surface.png`): the sun light was taken through the home planet's atmosphere model at the camera's altitude over the home planet, and the image-based light cube was captured from the home planet's sky around the home planet's vertical, so the vessel had no light except the direct sun; its shadow side was black. The effects system emitted only for vessels in the first body's sphere, so no dust and no plume light on the moon.

## Decision

1. **Airless light** (`airless-light.ts`, pure): when the active vessel is in the sphere of an airless body, the sun is white and fades over -1.5 to +1 degrees of elevation; the environment cube is a two-value dome around the local vertical (`uAirless` branch of the existing `sky-env` shader, so no new program): regolith below, lit by the sun (albedo 0.135 times irradiance times the sine of the elevation over PI), and a sky floor above (1.2e-2 of `sunIrradiance / PI`, blue-white). The floor stands for planetshine and starlight; the physical planetshine is about 1e-4 of the sun (research/airless-lighting.md), raised so the shadow side stays readable. Exposure keeps following the sun elevation at the camera (ADR 0027), taken around the local vertical. The home planet's path is untouched (`state.airless` is null).
2. **Dust on any airless ground** (`Effects`): a plume near the ground of an airless body (no atmosphere, a mass, a ground height from the scene) throws regolith into its own small pool (half the preset's smoke pool): fast, low, ballistic (no drag, no buoyancy, gravity of the body), alive for the time it takes to fall back. No smoke and no exhaust trail. The plume's light on the ground is not dimmed by air. `EffectsOptions.groundHeight` takes the body id.
3. Not done here: terrain shadows from the baked patch, stones as geometry, a `terrain` kind on `BodyDefinition` (draft 051).

## Consequences

- A third airless body gets light and dust without code.
- The smoke pool of the first body is unchanged; the dust pool costs at most half a pool of billboards written into the same draw.
- The sky floor is an artistic constant; changing it is a one-line change (`SKY_FLOOR`).
