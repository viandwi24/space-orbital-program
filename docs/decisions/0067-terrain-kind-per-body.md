# 0067 — The ground of a body is data on the body: a terrain kind and a seed

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/052-moon-terrain-shadows-stones-and-terrain-kind.md
**Builds on:** ADR 0043 (one height function in `core`), 0054 (the moon pass), 0013/0014 (data-form definitions), docs/conventions/versioning.md.

## Context

Which ground a body has was decided in three places by guesses about its other properties: `sim.worker.ts` gave the moon's craters to every body with a `parent` and the home planet's hills to every other; `scene.ts` gave the moon pass to every airless body after the first (`i > 0 && !b.atmosphere`); the tools that build a sim in tests copied the first rule. A mod that adds a third airless body could not choose its ground: it got craters if it had a parent, and an atmosphere meant a plain sphere to the renderer whatever the sim stood on.

## Decision

1. **`BodyDefinition.terrain`** (optional, API 0.1.18): `{ kind: 'hills' }` (the home planet's ridged terrain, launch site at latitude 0, longitude 0) or `{ kind: 'craters', seed?: 0..999 }` (the stock moon's cratered regolith, the landing plain at latitude 0, longitude 0). A body without it is a smooth sphere, with or without a parent or an atmosphere. The stock home planet says `hills`, the stock moon `craters`.
2. **The data names a kind, not a function.** A kind is a height function in `@orbital/core` with a GLSL twin in the renderer (ADR 0054: one function, read by the sim and baked by the GPU). A mod chooses a kind and, for craters, a seed; a body of another seed has its own craters, rims and hills on the same shape, which is what "a third airless body with its own terrain is a data change" needs. Supplying a new height function is a new kind in core and the renderer, an engine change by design: a function in mod data could not be mirrored in the shader.
3. **One selection function**: `createBodyTerrainField(body)` in `@orbital/core` (`body-terrain.ts`) returns the field for a body or `undefined`; `createSim({ terrain })` takes it as it is (`terrain: createBodyTerrainField`). The seed shifts every lattice salt of the crater function by `977 * seed` (core and GLSL, `uSeed`), so the plain around the landing site is the same flat ground for every seed.
4. **The renderer asks the same data**: the moon pass for a body other than the first whose `terrain.kind` is `craters` (any atmosphere); any other body after the first is a plain lit sphere. The first body is always the planet pass (atmosphere, hills of the launch site); `hills` on a later body is not drawn as hills (it stays a sphere there, while the sim would stand vessels on its terrain), see draft 059 ([plan 059](../plans/059-hills-terrain-on-a-second-body.md)).
5. Nothing reads `parent` or `atmosphere` to choose a ground any more (grep in the journal).

## Alternatives considered

- **A core table keyed by body id** (`stock.cinder` is craters): mods could not add one without editing core.
- **A function in the definition** (`terrain: (n) => height`): `BodyDefinition` is plain serialisable data validated by zod, saves and the mod package format carry it, and the shader could not follow a function. The kind-plus-parameters form keeps both.
- **Kind inferred from the stock mod's ids**: the heuristic this removes.

## Consequences

- API 0.1.18 (additive). Existing mod bodies without `terrain` become smooth spheres in the sim where a body without a parent used to get hills: none is known outside the stock mod, and `docs/guides/writing-a-mod.md` says it. Saves do not store terrain: it is a function of the body definition, which a save already checks (mods listed).
- `flight-loop.ts` passes `terrain` through to the renderer's body list.
