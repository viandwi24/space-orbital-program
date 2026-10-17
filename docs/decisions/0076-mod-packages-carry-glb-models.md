# 0076 — Mod packages carry glTF models; asset parts get plume and gimbal; fit checks warn

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/051-mod-visuals-and-assets.md
**Builds on:** ADR 0028 (visual descriptor, providers), 0047 (glTF provider), 0057 (package format, trust model), 0045 (articulation), hosting CSP (`architecture/hosting.md`).

## Context

ADR 0057 left a mod part with the stock generators and its own palette: geometry is renderer code, a package carries only code that runs in the sim Worker and the page's catalogue. Moddability is the product's headline and the bar is a public release (`product/visual-direction.md`), so a mod must be able to look like something no generator draws. Research: `research/mod-assets.md`.

## Decision

1. **A model ships inside the package; the package stays one JSON file.** Package format 2 adds `assets`: a map from path to `{ type: "model/gltf-binary", size, sha256, data }` (`data` is base64 of a `.glb`). Packages without assets stay format 1 and byte-identical to before; format 2 packages are refused by older games with "made for a newer game". Not a zip (ADR 0057 reasons hold), not a second file (an install would need two uploads and a way to tie them), not data URLs in code (the renderer, not the mod's code, loads models, and the trust prompt could not list them).
2. **The fingerprint covers the assets.** Each asset has its own SHA-256 of the decoded bytes. `sha256` of the package is the SHA-256 of the code when there are no assets (unchanged) and otherwise of the code, a marker and each `path hash` line in path order (`modPackageFingerprint`). The stored `trusted` fingerprint, the "changed since you trusted it" check and the trust prompt therefore cover models too.
3. **Format and caps** (checked by `parseModPackage` before any prompt, again by `resolveMods`): only `.glb` (glTF 2.0 binary); at most 2 MiB per model, 6 MiB and 32 files per package (decoded); at most 50 000 triangles and 32 mesh nodes per model (one part is drawn many times); at most 8 embedded textures, PNG or JPEG only; the file must be self-contained (no external or data URIs, so nothing is ever fetched); extensions limited to those three's loader decodes without extra files. Draco, Meshopt, KTX2/Basis, WebP and AVIF are refused with a message naming the extension (the game ships no decoders; KTX2 stays in draft 040). Asset paths are lower-case relative paths ending `.glb`, no `..`, at most 128 characters.
4. **The part names its model with `visual.asset`** (API 0.1.20, additive, `partVisualSchema`): the path of a file in the same package. `visual.kind` stays required and is the **fallback generator**: if the model cannot be loaded the part is drawn by that generator (or its shape), so a part is never invisible. `resolveMods` rejects the mod, naming part and file, when a part of the mod names an asset the package does not carry, and returns `partAssets` (part to path) plus the decoded assets. The older `kind: 'model'` with `params.url` still works for hosts and tests; mods should use `asset` (a URL is fetched at runtime, unhashed).
5. **Where it loads.** The page's root layout decodes nothing itself: after the mod runtime resolved, `prepareModelProviders` (lib/mods/asset-models.ts) imports the renderer only if some mod part names an asset, parses every model once in one `GltfPartProvider`, and the flight scene (`partProviders`) and the VAB (`providers`) take it from `modelProviders()`. The provider is placed before the procedural one, so it wins when its model parsed and declines otherwise. The sim Worker receives the assets with the bundle only so its `resolveMods` agrees with the page's; it never decodes a model.
6. **Authoring frame and fit.** A model is authored in the part frame (origin at the part's centre, +Y up, metres, the frame of `shape` and `attach`). Nothing is rescaled or moved. `assetFit` compares the model's bounds with the part's `shape` and attach nodes and returns warnings: sticking out of the shape by more than 5 cm or a tenth of the length, a model under 60 percent of the shape's height, an attach node more than that tolerance from the model's face it points at. The host logs them once per part; the sample mod's model has none.
7. **Asset parts behave like generated ones where it matters.** The engine plume (`visual.plume`), temperature glow (materials cloned the first time the skin is hot), shadows, and the gimbal/hinge articulation work: a node named `moving` is the part that turns, about its own origin, and the plume of a gimballed engine hangs on it (ADR 0045's rule). Ground light, smoke and debris shards already read the descriptor or the model's meshes. `visual.deploy` animations are **not** available to models (a warning says so). This closes the "asset parts get no plume or articulation" note of ADR 0047.
8. **VAB icons** come from the same factory call as every part (`VabView.renderIcon`), so a model part has its own icon once the provider is given to the view; nothing else.
9. **Trust prompt** lists every file (path, size, triangles, short fingerprint) and says models are drawn by the game and cannot run code. A model is data for three's loader, not code; it still counts toward "this mod is a program" because the package's code is.
10. **Build.** `tools/mod-build` packs every `.glb` under `<mod>/assets/` and the files returned by an optional `<mod>/assets.ts` (default export: function returning `{ path: bytes }`), and `tools/mod-build/glb.ts` is a small GLB/PNG writer so a mod can generate its models in code (the sample does: no binary art, no licence).
11. **CSP.** No change: embedded images become `blob:` URLs read through `img-src` or `connect-src`, both already allowing `blob:` in the production policy; a policy without `blob:` there fails closed (the part falls back to its generator and the console says why).

## Alternatives considered

- **A declarative geometry description (lathe profile, boxes) validated by a schema.** No renderer-side asset parsing, but a second authoring language to design, document and keep rendering-compatible, and strictly less capable than glTF, which every modelling tool exports. Not done; a mod that wants a lathe can generate a GLB (`tools/mod-build/glb.ts`).
- **Executable renderer hooks (a mod registers a generator).** Out of scope in the plan and a second trust boundary in the render loop.
- **Zip or two files.** See point 1.
- **Reject instead of warn on a bad fit.** The shape is physics, the model a look; a modder tuning a model should see it. A hard failure would hide the part.
- **Auto-scale the model to the shape.** Silent wrongness that differs per part; the warning names the numbers.

## Consequences

- API 0.1.20: `partVisualSchema.asset`; core exports `modAssetSchema`, `inspectGlb`, `decodeAssets`, `modPackageFingerprint`, `createModPackage(manifest, code, files)`, `ResolvedMods.partAssets/assets`, `ModBundle.assets`, caps constants.
- `ModRecord.assets` in the `orbital-mods` database (same record, no schema bump); trusted fingerprint now `modPackageFingerprint`, equal to the old hash for code-only mods, so installed mods keep working.
- The renderer chunk grows by three's `GLTFLoader` (about 52 KB raw, loaded only on the flight and VAB pages); measured in journal 051.
- Models are shared between the flight renderer and the VAB (separate canvases, never live together); three keeps GPU copies per context.
