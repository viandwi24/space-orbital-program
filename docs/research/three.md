# Three.js (renderer, plan 008)

Checked **2026-10-16**. Installed: `three` 0.186.1 (npm latest 0.186.1), `@types/three` 0.186.0 (npm latest 0.186.0). Only what `@orbital/renderer` uses is recorded.

| Topic | Fact | Source |
|---|---|---|
| `WebGLRenderer` ctor | `new WebGLRenderer({ canvas, antialias, powerPreference, logarithmicDepthBuffer })`. `logarithmicDepthBuffer` (default `false`) is for huge scale differences; uses `gl_FragDepth`, which disables early-Z (performance cost). `reversedDepthBuffer` (default `false`) is the faster alternative but needs `EXT_clip_control`; not used (availability). In `@types/three` these parameters come from `WebGLCapabilitiesParameters`. | https://threejs.org/docs/pages/WebGLRenderer.html |
| Renderer methods | `setSize(w, h, updateStyle = true)` (device pixel ratio applied), `setPixelRatio(v)`, `render(scene, camera)`, `dispose()` (frees GPU resources; call on teardown). | same |
| `PerspectiveCamera` | `new PerspectiveCamera(fov = 50, aspect = 1, near = 0.1, far = 2000)`; fov in degrees vertical; near > 0; call `updateProjectionMatrix()` after changing `fov/aspect/near/far`. | https://threejs.org/docs/pages/PerspectiveCamera.html |
| `Line` | `new Line(geometry: BufferGeometry, material = LineBasicMaterial)`; `BufferGeometry.setFromPoints(Vector3[])`. WebGL lines are always 1 px wide, so thick lines need `Line2`. | https://threejs.org/docs/pages/Line.html |
| `Line2` (addon) | `import { Line2 } from 'three/addons/lines/Line2.js'`, with `LineGeometry` (`setPositions(flat number[])`) and `LineMaterial` (`color`, `linewidth` in px, `resolution` Vector2 that must be set to the viewport size and updated on resize). WebGL renderer only. Package `exports` maps `./addons/*` to `examples/jsm/*`; `@types/three` ships the `.d.ts`. `LineMaterial.js` contains `logdepthbuf` chunks, so it works with the log depth buffer. | https://threejs.org/docs/pages/Line2.html · installed `three/package.json` exports, `examples/jsm/lines/LineMaterial.js` |
| `GLTFLoader` (later) | `three/addons/loaders/GLTFLoader.js`; not used in plan 008 (placeholder meshes only). Verify again when real part art arrives. | — |

## Decisions that follow

- Log depth buffer on (ADR 0007), camera `near = 0.1 m`, `far = 1e13 m`. Floating origin keeps the float32 scene coordinates small near the vessel; the log depth buffer handles the depth range between a metre-scale vessel and a planet-scale body.
- Core Three objects (`Scene`, `Group`, `Mesh`, geometries, `PerspectiveCamera`) work without WebGL, so the scene model is unit-tested in Bun; only `WebGLRenderer` needs a browser (plan 009 `[manual]`).

## Plan 019: environment pipeline (checked 2026-10-16, three 0.186.1)

Facts below come from the pages named and, where a page was only an API stub, from the installed source under `node_modules/three/src` and `examples/jsm` (noted as "source").

| Topic | Fact | Source |
|---|---|---|
| `EffectComposer` | `new EffectComposer(renderer, renderTarget?)`; a passed target and its clone are the read/write buffers, so MSAA and `HalfFloatType` are chosen by the target we pass. `addPass`, `render(deltaTime)`, `setSize`, `setPixelRatio`. The last pass renders to the screen. | https://threejs.org/docs/pages/EffectComposer.html |
| `RenderPass` | `new RenderPass(scene, camera)` renders into the composer's buffer; works with the log depth buffer because the material shaders write `gl_FragDepth` themselves (source `ShaderChunk/logdepthbuf_fragment`). | source |
| `UnrealBloomPass` | `new UnrealBloomPass(resolution: Vector2, strength, radius, threshold)`; radius in `[0, 1]`; mip-chain blur; needs tone mapping enabled in the renderer. We use threshold 3 (HDR) so only the sun, lamps and plume bloom. | https://threejs.org/docs/pages/UnrealBloomPass.html |
| `OutputPass` | Last pass: applies `renderer.toneMapping`, `toneMappingExposure` and `outputColorSpace`; passes that need sRGB input (FXAA) must follow it. Render targets are not tone mapped, only the screen is; so custom shaders write linear HDR and include `<tonemapping_fragment>` + `<colorspace_fragment>`, which are no-ops inside the chain. | https://threejs.org/docs/pages/OutputPass.html · source `WebGLPrograms` (`toneMapping` is `NoToneMapping` for render targets) |
| `Sky` addon | Preetham "Practical Analytic Model for Daylight" skydome, scaled to enclose the camera; uniforms `turbidity`, `rayleigh`, `mieCoefficient`, `mieDirectionalG`, `sunPosition`. A ground-level dome: no planet curvature, no atmospheric rim from space. Not used; ADR 0027 uses a custom Rayleigh + Mie march. | https://threejs.org/docs/pages/Sky.html |
| Shadow map in r186 | Directional shadows use a native `DepthTexture` with `compareFunction = LessEqualCompare` and linear filtering (`PCFShadowMap`, hardware PCF: GLSL `sampler2DShadow`); `PCFSoftShadowMap` was removed. A custom shader can bind `light.shadow.map.depthTexture` and `light.shadow.matrix` as a `sampler2DShadow`. three's own "empty" shadow texture is never uploaded: binding it to a shadow sampler makes WebGL report `Mismatch between texture format and sampler type` and the draw is skipped, so a real depth texture with a compare function must always be bound (found in plan 019). | source `WebGLShadowMap.js`, `WebGLUniforms.js`, `WebGLTextures.js`; https://threejs.org/docs/pages/DirectionalLightShadow.html (stub) |
| Shadow camera | `light.shadow.camera` is an `OrthographicCamera`; set `left/right/top/bottom/near/far` then `updateProjectionMatrix()`; `mapSize`, `bias` (negative = lit more), `normalBias`, `radius`. | same page |
| `CSM` addon | `examples/jsm/csm/CSM.js` splits the camera frustum into cascades; our shadow is a box around the vessel and launch site, so a single fitted map is simpler. Not used. | source |
| `InstancedMesh` | `new InstancedMesh(geometry, material, count)`; `setMatrixAt`, then `instanceMatrix.needsUpdate = true`; call `computeBoundingSphere()` after setting spread-out instances or frustum culling uses a stale sphere. Used for trees, rocks and lamps. | https://threejs.org/docs/pages/InstancedMesh.html |
| `PMREMGenerator` | `fromScene(scene, sigma, near, far, { size, position })` returns the prefiltered cube as a render target; assign `.texture` to `scene.environment`. We render a procedural sky/ground scene and refresh it when the sun or altitude changed enough. | https://threejs.org/docs/pages/PMREMGenerator.html |
| Log depth and custom shaders | With `logarithmicDepthBuffer: true` every program gets `#define USE_LOGARITHMIC_DEPTH_BUFFER` and the renderer sets `logDepthBufFC = 2 / (log(far + 1) / LN2)`. A fullscreen shader writes `gl_FragDepth = log2(1 + viewDepth) * logDepthBufFC * 0.5` with `viewDepth` the distance along the camera forward axis (what `vFragDepth = 1 + gl_Position.w` carries for meshes). | source `ShaderChunk/logdepthbuf_*`, `WebGLRenderer.js` |
| Inverse projection with a 1e13 far plane | `projectionMatrixInverse` applied to NDC z = 1 divides by zero (w = 0) at this far plane; reconstruct view rays with NDC z = 0. | found in plan 019 |
| Hidden browser pane | `requestAnimationFrame` does not fire while the Browser pane is hidden; manual runs drive `update()` and `render()` from the console. | built-in browser skill; observed |
