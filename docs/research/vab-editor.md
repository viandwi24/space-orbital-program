# VAB editor and hangar view (plan 022)

Checked **2026-10-16**. Installed `three` 0.186.1.

| Topic | Fact used | Source |
|---|---|---|
| `Raycaster` | `setFromCamera(ndc, camera)` with x, y in -1..1; `intersectObjects(objects, recursive)` returns hits sorted nearest first with `distance`, `point`, `object`, `faceIndex`; a ray only hits front faces unless `material.side = DoubleSide`. Node handles are picked with `Ray.intersectSphere` (pure, tested), parts with the raycaster. | https://threejs.org/docs/pages/Raycaster.html |
| `PMREMGenerator.fromScene(scene, sigma, near, far, { size, position })` | Returns a `WebGLRenderTarget`; assign `.texture` to `scene.environment`. One generator is enough; dispose the target when replaced. The hangar bakes its own interior (lamps, walls) into the environment instead of using `RoomEnvironment`, so reflections on the paint show the room the vessel stands in. | https://threejs.org/docs/pages/PMREMGenerator.html |
| `PerspectiveCamera.setViewOffset(fullW, fullH, x, y, w, h)` | Renders a sub-rectangle of a larger frustum; the VAB uses it to shift the optical centre so the vessel sits in the free area between the side panels; `clearViewOffset()` removes it; call `updateProjectionMatrix()` after. | https://threejs.org/docs/pages/PerspectiveCamera.html |
| `WebGLRenderer.readRenderTargetPixels(rt, x, y, w, h, buffer)` | `Uint8Array(w*h*4)` for an RGBA8 target; rows come bottom-up, so the icon code flips them when writing a 2D canvas. `setRenderTarget(null)` returns to the canvas. | https://threejs.org/docs/pages/WebGLRenderer.html |
| Tone mapping and shadows | `toneMapping = ACESFilmicToneMapping`, `toneMappingExposure` default 1; `shadowMap.type` PCF default, `autoUpdate` true. | same |
| Svelte 5 `$state.raw` | Cannot be mutated, only reassigned; fits the editor state (immutable snapshots replaced per edit). Class instances and non-plain objects are not proxied by `$state`. | https://svelte.dev/docs/svelte/$state |
| HTML drag and drop, keyboard alternative | Stage chips use native `draggable` plus a keyboard path (Alt+Up/Down) so the stage editor works without a pointer. | decision, ADR 0029 |
| Screenshot capture (tooling only) | `html-to-image` 1.11.11 (https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js, loaded into the page console, not a dependency) rasterises the DOM through an SVG `foreignObject`; `backdrop-filter` does not blur in that path. Used to composite the DOM over the hand-rendered canvas for `docs/journal/assets/022-*.png`. | https://github.com/bubkoo/html-to-image |

## Plan 029 (VAB follow-ups)

Checked **2026-10-17**.

| Topic | Fact used | Source |
|---|---|---|
| Storage limits | `localStorage` 5 MiB per origin (strings, synchronous, `QuotaExceededError` beyond). IndexedDB is quota-based: Chromium up to 60 % of the disk, Firefox min(10 % of disk, 10 GiB), Safari about 60 %; best-effort data can be evicted under pressure, `navigator.storage.persist()` asks for persistent storage; eviction is all-or-nothing per origin. Basis for the library in IndexedDB (ADR 0041). | https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria |
| `InstancedMesh` | `new InstancedMesh(geometry, material, count)`; `setMatrixAt(i, m)` then `instanceMatrix.needsUpdate = true`; one draw call for all instances; the bounding sphere is computed on demand, recompute after moving instances (`computeBoundingSphere`). Symmetric copies of a part share one geometry and material. | https://threejs.org/docs/pages/InstancedMesh.html |
| `BatchedMesh` | Different geometries with one material in one draw call, but fixed vertex/index/instance capacities, no negative scale, manual `optimize()`; not chosen (copies of the same part share geometry, so `InstancedMesh` is enough). | https://threejs.org/docs/pages/BatchedMesh.html |
| Svelte 5 `.svelte.ts` modules | Runes work in `.svelte.js`/`.svelte.ts` files for reusable reactive logic; reassigned state cannot be exported directly (hold it in an object or class). The page controller uses a class with `$state` fields. | https://svelte.dev/docs/svelte/svelte-js-files |
| Static margin rule | A rocket is stable when the centre of pressure is behind the centre of gravity; one body calibre is the usual target. (See `research/fin-aerodynamics.md`, 2026-10-16.) | https://dept.aem.umn.edu/~./faculty/flaten/AEM1905RocketrySampleDocuments/CG_and_CP_Slides.pdf |
