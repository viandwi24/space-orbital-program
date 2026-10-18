# Mod-supplied models (plan 051)

Checked **2026-10-17** (three 0.186.1, installed; Bun 1.4.2).

| Topic | Fact used | Source |
|---|---|---|
| `GLTFLoader.parse` | `parse(data: ArrayBuffer \| string, path, onLoad, onError)`; a GLB is read from an `ArrayBuffer`, a `.gltf` from text. `path` resolves external resources; a self-contained GLB needs none. | https://threejs.org/docs/pages/GLTFLoader.html |
| Embedded images | Read in the installed loader (`three/examples/jsm/loaders/GLTFLoader.js`): an image stored in a `bufferView` becomes a `Blob`, then `URL.createObjectURL(blob)`, then loaded by `ImageBitmapLoader` (when `createImageBitmap` exists; not on Safari < 17 or Firefox < 98) or `TextureLoader`. So the page only needs `blob:` in `img-src` (TextureLoader) and `connect-src` (ImageBitmapLoader fetches the blob URL), both already in the production policy of `architecture/hosting.md`. Verified in the browser run (journal 051): no CSP violation. | installed source, line numbers in journal 051; https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/img-src |
| Extensions that need decoders | `setDRACOLoader` for `KHR_draco_mesh_compression`, `setKTX2Loader` for KTX2 textures, `setMeshoptDecoder` for `EXT_meshopt_compression`. Each needs decoder files (wasm/js) served by the host. Not shipped by the game; a package cannot carry them, so `inspectGlb` refuses these extensions and WebP/AVIF images. Other supported extensions (PBR material extras, `KHR_texture_transform`, `KHR_mesh_quantization`) need nothing and are allowed. | https://threejs.org/docs/pages/GLTFLoader.html |
| KTX2/Basis versus PNG/JPEG | KTX2 saves GPU memory and upload time for large textures but needs the Basis transcoder (about 200 KB wasm plus glue) and an offline tool chain; a part uses a few 64 to 512 px textures, where PNG/JPEG decode is cheap. Decision: PNG/JPEG now, KTX2 stays in draft 040. | design decision (ADR 0076) |
| Quota | IndexedDB per origin: Chromium up to 60 percent of disk, Firefox best-effort the smaller of 10 percent of disk or 10 GiB, Safari about 60 percent in browser apps. A write over the quota fails with `QuotaExceededError` (already mapped to "no room left" by `ModStoreError`). No per-record limit is documented; the package caps (2 MiB per model, 6 MiB per package) keep every record far below any practical limit. | https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria |
| Base64 | `atob`/`btoa` exist in browsers, Workers, Bun and Node; the package carries models as base64 (33 percent larger than binary) inside the one JSON file, so a package is still a single file that can be inspected and attached. | https://developer.mozilla.org/en-US/docs/Web/API/Window/atob |
| Blob URLs and workers | `URL.createObjectURL` works in the page; the sim Worker never decodes models (the renderer runs in the page). | MDN, Web Workers API |

## Plan 065: clips, LODs, KTX2 (checked 2026-10-18, three 0.186.1)

- `GLTFLoader` returns `animations` (`AnimationClip[]`); a paused action ignores `AnimationMixer.setTime`, so a clip posed by a progress sets `action.time` and calls `mixer.update(0)`, with `LoopOnce` and `clampWhenFinished` so the end does not wrap.
- `LOD.addLevel(object, distance)`; `WebGLRenderer` updates `LOD` objects itself when `autoUpdate` is true (the default), so a model part needs no per-frame call.
- `KTX2Loader` needs `setTranscoderPath` (three's `examples/jsm/libs/basis/`: `basis_transcoder.wasm` 515 KB, `basis_transcoder.js` 56 KB) and `detectSupport(renderer)` before use; it transcodes in a blob Worker (CSP `worker-src blob:` and `'wasm-unsafe-eval'` already allow it). `GLTFLoader.setKTX2Loader` attaches it.
