# 0028 — Part visuals: a mod-supplied descriptor and a model provider interface

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/020-part-models-and-effects.md

## Context

ADR 0025 asks for parts that look like rockets, built in code now and replaceable by assets later. ADR 0012/0014 give the renderer only `PartShape` (box or cylinder), which is a physics placeholder. Two places could hold "what a part looks like": a renderer table keyed by part id, or data on the part definition supplied by the mod. Stock content is a mod (ADR 0005) and a third-party mod must be able to look like something; a renderer table keyed by `stock.tank-small` would make the renderer know stock ids and leave every other mod with grey cylinders.

## Decision

1. **Descriptor on the definition.** `PartDefinition.visual?: PartVisual`, validated by `partVisualSchema` in core and exported through the SDK (API 0.1.5 to 0.1.6, additive):
   - `kind` — name of a generator (`capsule`, `tank`, `engine`, `decoupler`, `reaction-wheel`, `landing-legs`, `heat-shield`, `plain`); an unknown kind falls back to the part's `shape` mesh.
   - `palette?` — `primary`, `secondary`, `accent` as `#rrggbb`.
   - `params?` — flat record of numbers/strings/booleans read by the generator (generators clamp and default every value; unknown keys are ignored).
   - `plume?` — `{ module, nozzle, exitRadius, length, exitPressure?, color? }`: the engine effect. `module` names the module whose snapshot (`PartSnapshot.modules[module]`) has `ignited`, `throttle` and `flameout` fields (the stock engine's state). `nozzle` is the exit centre in the part frame, thrust along local +Y so the plume points along -Y.
   - `deploy?` — `{ module, flag, seconds? }`: the animated state (a boolean field of that module's snapshot, e.g. `stock.landing-leg` `deployed`).
   `shape` stays the physics/thermal shape; the visual must fit inside it when retracted (tested).
2. **Generators are keyed by `kind`, not by part id.** The renderer owns a registry of procedural generators (`registerPartGenerator`). The generators are plain functions returning geometry in named material slots plus attach nodes, built with the renderer's own `revolve` (hard edges where the profile says so) and `mergeGeometries` with material groups.
3. **Provider interface.** `PartModelProvider { id; create(request): PartModel | null }` with `PartModelRequest { definition, shape?, visual? }`. `PartModelFactory` asks the providers in order and takes the first non-null model; the defaults are the procedural provider (a known `visual.kind`) then the shape fallback (a `shape`, or a 1 m box). Hosts can pass `partProviders` in `SceneConfig` / `RendererConfig`; a provider that needs async assets returns `null` until its assets are loaded and may implement `preload(definitions)` that the host awaits before the first snapshot. When real art arrives, an asset provider claims a `visual.kind: 'model'` (or a definition id) with a `params.url`, and the generators remain as the fallback. A `PartModel` is `{ root, bounds, nodes, triangles, update(state, dt), dispose() }`, usable without a snapshot: plan 022 builds icons and the hangar view from `PartModelFactory.create(id)`.
4. **Effects are driven by snapshots only.** Plume, glow and deploy read `PartSnapshot.modules` and `temperature`. Explosions and separation puffs are inferred from snapshot transitions (a part disappearing, a vessel splitting), with ground-relative speed from the body rotation in successive snapshots, because the renderer must not read events or sim state (ADR 0003); the same transition rules are unit-tested in Bun.
5. **Materials** are a library keyed by (slot, colour): `MeshPhysicalMaterial` with clear coat for paint, `MeshStandardMaterial` for metals and foil, procedural `DataTexture`s (normal and weathering maps for panel seams and rivets, foil crinkle, tile grid) generated in TypeScript so they work in Bun tests and need no canvas; texture size, radial segments, particle counts and debris counts come from the preset table.
6. **Glow** needs per-part emissive, so a part model clones its materials the first time it is hot (> 650 K) and keeps the clones; cold parts share the library materials.

## Alternatives considered

- **Renderer table keyed by part id (the draft's first option):** the quickest, but it hard-codes stock ids in the renderer, gives mods nothing, and makes an asset swap a renderer edit.
- **Mods supply geometry (vertex arrays) through the SDK:** environment-neutral but heavy in the definition, couples the SDK to mesh formats and invites per-mod rendering bugs; the descriptor keeps mods declarative.
- **A free-form `visual` object per module (e.g. the engine module owning the plume):** more general, but modules are simulation code run in the Worker; the look belongs with the part data the main thread already holds (`catalog.parts`).
- **Canvas textures:** unavailable in Bun and not needed; `DataTexture` generated from seeded noise is deterministic and testable.

## Consequences

- API 0.1.6: `partVisualSchema`, `PartVisual`, `PartDefinition.visual`; documented in `plugin-system.md` and `guides/writing-a-mod.md`.
- The host maps `catalog.parts[].visual` into `RendererConfig.partVisuals` (an additive `Map`, like `partShapes`); parts without a descriptor still render as plain shapes.
- The scene gets effect objects as siblings of the vessel groups (not children), keeping the vessel group's children one-to-one with parts.
- Plume `module` fields and the `ignited/throttle/flameout` convention are a soft contract between a mod's engine module and its visual; documented, not enforced by types.
- Draft plan follow-ups: radial parts and fins as stock parts, asset-backed provider, engine gimbal.
