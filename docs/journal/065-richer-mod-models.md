# 065 — Richer mod models

**Plan:** [plans/065-richer-mod-models.md](../plans/065-richer-mod-models.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0160](../decisions/0160-richer-mod-models-deploy-clips-lods-material-palette-ktx2.md) (new), [0076](../decisions/0076-mod-packages-carry-glb-models.md) · **Research:** `mod-assets.md` (plan 065)

**Status when written: criteria met here, except a measured memory saving of KTX2 against PNG (no KTX2 sample texture; see below).**

## What was done

| Where | What |
|---|---|
| `packages/core` | `PartVisual.deploy.clip`, `lods` (1 to 3, increasing distances), `materials` (palette slots by material name); `inspectGlb` counts animations (at most 4) and keyframes (at most 20 000) and accepts `KHR_texture_basisu` with `image/ktx2`; the resolver checks every LOD asset and lists it with its level; API_VERSION 0.1.60 |
| `packages/renderer/src/parts/gltf-provider.ts` | the deploy clip posed by the generated parts' progress, a three `LOD` for `lods` (assets keyed `lodAssetKey`), palette slots on named materials, a `KTX2Loader` attached only for a model that uses KTX2 (`usesBasisu`, `createKtx2Loader`) |
| `tools/mod-build/glb.ts` | animations and KTX2 images in the GLB writer |
| web | the mod runtime keys LOD bytes by level; the provider gets `createKtx2Loader('/basis/')`; `scripts/copy-basis.ts` copies three's transcoder into `static/basis/` before `dev` and `build` (gitignored) |
| tests | core `mod-assets.test.ts` (+3), renderer `mod-model-richer.test.ts` (4) |

## Bundle cost

The transcoder is two static files, never in the JS bundle: `basis_transcoder.wasm` 515 KB and `basis_transcoder.js` 56 KB (245 KB and 15 KB gzipped, plan 040). They are fetched only when a mod model uses KTX2. `KTX2Loader` itself is a dynamic import inside `createKtx2Loader`. A game without such a model downloads nothing more.

## What surprised me

- **A paused action does not follow `mixer.setTime`.** The leg stayed closed at progress 0.5; the clip is now posed by `action.time` and `mixer.update(0)`, played once and clamped.
- **The web app cannot import three.** three is the renderer's dependency, so the KTX2 loader is made by a renderer helper and the transcoder copy resolves three from the renderer's folder.
- **No KTX2 texture to measure.** Producing a Basis texture needs an encoder (`toktx`, `basisu`) that this machine does not have; the memory saving against PNG is not measured. The inspector, the loader wiring and the refusal without a transcoder are tested with a stub image.
- **Deferred** (ADR 0160 point 5): instancing in the Hangar, and LOD for building models (the Space Center draws generator buildings only).
