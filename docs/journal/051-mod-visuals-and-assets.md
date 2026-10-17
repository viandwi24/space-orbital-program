# Journal 051 — Mod-supplied part visuals and assets

2026-10-17, mod-assets session. ADR 0076, research `research/mod-assets.md`.

## What was built

- **Core** (`mod-assets.ts`, `mods.ts`, API 0.1.20): format 2 packages with `assets`; `inspectGlb` (container, self-contained, extensions, triangle and draw-call budget, PNG/JPEG only), `decodeAssets`, `modPackageFingerprint` (code-only packages keep the old hash), `resolveMods` returns `partAssets` and rejects a mod whose part names a missing file; `PartVisual.asset`.
- **Renderer** (`parts/gltf-provider.ts`, `parts/asset-fit.ts`): the provider takes bytes per definition, gives models plume (on the `moving` pivot for a gimbal), articulation, glow, shadows and fit warnings; `VabView` takes `providers`.
- **Build** (`tools/mod-build`): packs `assets/*.glb` and the result of `assets.ts`; `glb.ts` writes GLB and PNG so a model is generated in code.
- **Sample**: `sample.spike-engine` (stock engine module by id, the model has a textured housing, a gold band and a bell on a `moving` node; 832 triangles, 3 meshes, 64 x 64 PNG; 24.7 KB; package 37 KB).
- **Web**: `ModRecord.assets`, the fingerprint check with assets, the trust prompt lists files, the Worker `init` message carries assets, `lib/mods/asset-models.ts` builds the provider in the root layout (dynamic import: nothing is loaded without mod models), flight and VAB take it.

## Browser run (built-in browser, port 5228, production headers from `scripts/serve.ts`, clean copy of HEAD)

Installed from the package's address (`051-trust-prompt.jpg`: "Also ships models/spike-engine.glb: 3D model, 24.7 KB, 832 triangles"), reloaded. The VAB lists the three sample parts; the engine has its own icon (`051-vab-catalogue-icons.jpg`), a pod, wide tank and engine stack gave 2,235 m/s and TWR 1.82 (`051-vab-asset-engine-stack.jpg`). Launched, staged, full throttle: the plume of the asset engine at 1.01 km (`051-flight-asset-engine-plume.jpg`). The console was empty throughout: no CSP violation (embedded PNG goes through `blob:`), no fit warning, no load failure.

## Measurements

- Bundle (clean build of HEAD against `9ed28a0`): all JS 6,721,768 to 6,808,000 bytes raw, 2,324,572 to 2,350,759 gzip. The renderer chunk grew 966,444 to 1,018,883 (three's `GLTFLoader` was tree-shaken before and is now reachable through the dynamic import); the shared core chunk 437,029 to 442,610; the sim Worker +5 KB (core). The renderer chunk loads only on the flight and VAB pages.
- Frame: the model is 832 triangles and 3 draw calls (the procedural engine is about the same order). The browser pane gave 6 frames per second during the run (software GL in a hidden pane, another session running), so no honest frame time came from it; the cost is stated by triangle and draw-call counts, as the plan's AC allows ("frame/bundle impact stated"). M1/M2 not available.

## Surprises

- `GLTFLoader` needs `createImageBitmap` for embedded textures; Bun has none, so the tests stub it (the loader then goes through `URL.createObjectURL` and `fetch` of the blob URL, which Bun supports): that exercises the same code as the browser except the decode.
- The Worker's `resolveMods` rejected the sample after the check "part names a missing asset", because the Worker's bundle had no assets: the bundle now carries them (cloned once) so page and Worker agree; the Worker never decodes a model.
- `sample.test.ts` and the web fixtures had to pass `assets` to `resolveMods` for the same reason.
- vitest can run the dynamic import of the renderer (three) in node: `prepareModelProviders` is tested with garbage bytes (fails cleanly, game goes on).
- Placing parts in the VAB through the browser pane needs a screenshot or wait between key presses: the page processed Tab and Enter after the next screenshot.

## Found, not done

- `visual.deploy` for models, KTX2, LOD and instancing of model parts in the VAB, palette recolouring of models: draft 065. KTX2 on the stock side stays in draft 040.
- The mod list does not show per-mod model counts (the prompt does).
- Frame time of model parts on a slower GPU is not measured.

## Verification output

```
bun run test                      1129 pass, 0 fail (129 files)
apps/web vitest run                649 pass (74 files)
bun run typecheck                 all packages 0; web: 1494 FILES 0 ERRORS 0 WARNINGS
bun run build                     done
bun run docs:check                docs-check: OK (63 plans, 75 ADRs)
bunx playwright test --project=chromium -g mod   (E2E_HEADERS=1, workers 1)   1 passed
```
