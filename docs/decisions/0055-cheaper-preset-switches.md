# 0055 — Cheaper preset switches: vegetation kept per preset, terrain baked over frames

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/048-half-resolution-planet-pass.md

## Context

A `setPreset` costs 130 to 290 ms (journal 039): the site vegetation is regenerated (48 to 207 ms) and the first frame re-bakes the terrain cube map and patches (40 to 130 ms). The quality governor (ADR 0053) can switch presets in the middle of a flight, so the switch is a visible stutter. The compile (`precompile`) and the biome map (`warmMaps`) are already moved off the switch.

## Decision

1. **Vegetation sets are kept per (trees, tufts) budget.** `LaunchSite` builds a set (trees, bushes, rocks, tuft cells) once, keeps it, and a switch moves the set in and out of the scene graph; nothing is built or disposed. The other presets' sets are built ahead by `Renderer.precompile`, one mesh per idle period (`requestIdleCallback` with a timeout, as for the maps). A switch to a set that is not ready yet builds it synchronously, as before. Sets that are out of the scene upload nothing to the GPU.
2. **The terrain bake is progressive for a resolution change.** When `terrainSize` or `terrainPatch` changes, the planet pass keeps using the baked textures it has (correct heights at the old texel size; the shader never reads the texture size) and bakes the new ones in the background, one cube face or one patch per frame, swapping a texture in only when it is complete. The first bake and a change of site are still done at once, because there is nothing valid to draw with. A change of the colour-map width no longer invalidates the terrain: heights always read the canonical-width map (`heightMap()`), so the baked data does not change.

3. **The programs of every preset are compiled ahead, in the state a frame is drawn in.** `precompile` waits for the first frame (the hemisphere light is hidden and the sky environment map is set from then on, both are part of three's program cache key), then compiles the scene with shadows on or off and with the post chain or the canvas as target, the planet pass and the march prepass at each preset's defines (the march prepass in a scene without lights), and the vessel's part materials at each preset's detail (`SceneModel.warmPartScene`, own factory so the programs outlive the switch).
4. **The post chain is kept** on `low` (shrunk to 1 x 1) so its programs stay compiled; **the sky light is not re-captured** on a switch, which needs one cube size for all presets: `low.envSize` is 128 (a different size changes the cube-UV size in every standard material's program key). **The shadow map** follows a new size three frames after the switch (4096 costs 30 to 36 ms to allocate); a map that does not exist yet is allocated at once.

## Alternatives considered

- **Allocate the instanced meshes at the largest count and change `InstancedMesh.count`.** `count` can be lowered after construction but not raised past the capacity (three.js docs, 2026-10-17). Rejected for the content: `layoutVegetation` draws bushes and rocks from the same seeded generator after the trees and `layoutTufts` sizes its grid from the count, so the lower presets are not prefixes of `high`; cutting `count` would change their look (a visual regression the plan forbids).
- **Cache one cube map per terrain size and warm them.** Zero cost at the switch, but 12.6 MB (512) + 28 MB (768) + 50 MB (1024) of half-float cube kept resident, and patches depend on the camera so they cannot be cached anyway. Rejected for memory on the budget machines; the progressive swap needs one extra target only while it runs.
- **Build vegetation incrementally inside the switch over several frames.** Leaves a half-built site for 5 to 10 frames; the per-preset set has no visible intermediate state.

## Consequences

- GPU and CPU memory hold the vegetation of the presets that were warmed (about 2 MB of instance matrices and colours for all three), and the geometry is shared.
- `LaunchSite` gains a warm-up API used by `Renderer.precompile`; `PlanetPass` gains a progressive bake queue. The `Renderer` interface does not change.
- The first frames after a resolution change draw with the old texel size for up to about 8 frames (one face or patch per frame).
