# 0160 — Richer mod models: a deploy clip, a typed LOD list, palette slots on named materials, KTX2 textures

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [065](../plans/065-richer-mod-models.md)
**Builds on:** ADR 0076 (models in mod packages: `inspectGlb`, the glTF provider, the fallback generator), ADR 0045 (articulation), ADR 0104 (patchable typed data), ADR 0174 (part action state), ADR 0028 and 0047 (part models)

## Context

A model part (`visual.asset`) gets plume, gimbal or hinge, glow and shadows, but its `visual.deploy` is ignored with a warning, it has one level of detail, its `palette` recolours nothing, and its textures must be PNG or JPEG. Generated parts animate a 0..1 deploy progress from a module flag (`visual.deploy.module` and `flag`, over `seconds`). Plan 040 measured three 0.186.1's Basis transcoder: 515 kB wasm (245 kB gzipped) plus 56 kB of script.

## Decision

1. **Deploy plays a clip.** A model part with `visual.deploy` plays the glTF animation named `visual.deploy.clip` (default `deploy`; the first clip when none has that name) at `progress × duration`: the same progress, from the same flag and `seconds`, that a generated part animates (the flag comes from the module's snapshot, which plan 110's actions set). A model without any clip keeps the warning. `inspectGlb` counts animations (at most 4) and keyframes (at most 20 000 samples over all channels).
2. **LOD is a typed list.** `visual.lods: [{ asset, distance }]` (1 to 3 entries, distances in metres from the camera, increasing) adds lower-detail models of the same part frame; the base `asset` draws closer than the first distance. Each is checked like `asset` (the package must carry it, `inspectGlb`'s budget). The renderer uses three's `LOD` inside the model's root, so plume, articulation and deploy live on the base model only and a far level is a static shape. Patches target the list as any other field (ADR 0104).
3. **Palette slots on named materials.** `visual.materials: { <material name>: 'primary' | 'secondary' | 'accent' }` sets the base colour of each named glTF material to that slot of `visual.palette`, once per part definition when the model loads.
4. **KTX2 textures are accepted.** `inspectGlb` allows `KHR_texture_basisu` with `image/ktx2` images. The game serves three's transcoder as static files (`/basis/`); the glTF provider attaches a `KTX2Loader` only when an asset uses the extension, so a game without such assets downloads nothing more. A KTX2 asset needs the renderer to know the GPU's compressed formats: the host hands the provider a `detectSupport` callback with its WebGL renderer.
5. **Deferred.** Instancing identical static meshes in the Hangar (no measurement shows a cost to save yet), and LOD for building models (the Space Center does not draw building assets yet; plan 091 draws generator buildings).

## Alternatives considered

- **Deploy by named nodes rotated by the renderer** — a second animation system beside glTF's own, and every modder's tool exports clips.
- **`_lod1` naming inside one file** — not typed, not patchable (ADR 0104), and one file would carry every level's bytes against the 2 MB asset cap.

## Consequences

- SDK: `PartVisual` gains `deploy.clip`, `lods` and `materials` (additive); mod package format: KTX2 images accepted, animations counted.
- A mod model now costs what a generated part costs far away (its lower level), and folds out like one.
