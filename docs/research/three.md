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
