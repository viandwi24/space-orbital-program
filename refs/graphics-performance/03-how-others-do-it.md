# 03 — How others do it

## 1. Teleoperator (teleoperator.mindblown.ai): a teardown

The owner asked how this "AI-made" web game looks so good and still runs in a browser. Agent 2 inspected it on 2026-10-19 in the built-in browser:
- the page structure, the network requests, the game iframe's canvas;
- keyword counts and short excerpts of its public `app.js` bundle (4.07 MB, minified).

Nothing was downloaded beyond what the page loads. Its code is not reproduced here.

**What it is.** A driving game in a real San Francisco ("remote-pilot robotaxis"), multiplayer rooms, garage, races. Its own counter read **58 fps · 26.9 ms** in our pane.

**What makes it cheap.**

| Technique | Evidence | Why it is cheap |
|---|---|---|
| **Same engine as ours** | three.js **r186**; the bundle contains `WebGLRenderer` and WGSL code with a GPU device | The look is not the engine; it is how the frame is spent |
| **A custom WebGPU path** | WGSL shader code (`vec3f`, a `device`), canvas without a WebGL2 context | Less driver overhead; compute available |
| **Lighting baked into textures** | 83 `lightMap`, 80 `aoMap`, 173 `envMap` references | Soft shadows and occlusion are texture reads, not math |
| **Sky computed once into a texture** | `workers/sky.js`; a sky module with a LUT (`N: 256`) and a dome texture (`domeW: 2048`), functions `skyRad`, `sunRadiance`, `aerial` | The sky is one texture fetch per pixel; the physics runs rarely, off the main thread |
| **The city pre-processed into compact binaries** | `assets/real/{roads,terrain,buildings,props,coast,ground,green,btags}.bin.gz`, `veg/trees.bin.gz` (OpenStreetMap data) | No parsing or generation at run time |
| **Few draw calls** | `mergeGeometries`, 28 `InstancedMesh`, 24 `BatchedMesh`, 24 `LOD`, 57 `frustumCulled` | GPU time goes to pixels, not to draw overhead |
| **Short view distance hidden by fog** | 40 `Fog`, 30 `.far=` | Nothing beyond the fog is drawn |
| **Crowds animated in the vertex shader** | A shader comment explains that limbs are posed per instance from a gait stored in the instance matrix's spare row | Thousands of pedestrians with no CPU skinning |
| **No hitches while loading** | `workers/img.js`, `createImageBitmap`, `OffscreenCanvas`; KTX2/Basis, Draco, Meshopt; `compileAsync` with a "COMPILING SHADERS" screen | Decoding off the main thread; compiling up front |
| **Resolution cap** | 1024×768 CSS canvas at DPR 2 drawn as **1792×1344 (ratio 1.75)** | 23 % fewer pixels than ratio 2 |
| **Forgiving art direction** | Toy-like characters, saturated colours, bloom, ACES/AgX tone mapping, TAA/FXAA | Missing detail does not read as missing |

**What transfers to a planet game.**
- **Not baking light per place.** Our sun moves, the camera goes from the pad to orbit, and the ground is the whole planet.
- **The principle does transfer: compute once, read often.** For us that means:
  - a sky LUT (it does exactly this);
  - temporally amortised clouds;
  - noise in textures;
  - a pixel budget;
  - expensive work off the main thread;
  - shaders compiled up front (we already precompile).

**Adopt** the sky-as-texture idea and the resolution cap. **Improve** our instancing and culling where the site grows. **Avoid** assuming a city's baked look applies to a planet.

## 2. The GTA V browser port (October 2026)

**What it was.** An unofficial port at playgta5.com went viral on 6 October 2026 and was offline within hours [S37a].

**How it reportedly ran:**
- the RAGE engine compiled to **wasm64**;
- a DirectX 11 → **WebGPU** translation layer;
- about 700 MB of compressed assets streamed on demand [S37b, S37c].

**Performance:** "60 fps" is reported but unverified. A mirror tested on 13 October crashed with `RuntimeError: unreachable` [S37d].

**Provenance and legality:**
- Debug symbols reportedly point to leaked source; that and any AI involvement are unverified.
- It used Rockstar's code and assets without permission, so it is infringing.

**Lesson.** It shows the ceiling of wasm64 + WebGPU on desktop Chrome: a native engine's whole frame fits in a browser. It is not a technique we can copy, and it gives no usable numbers. It does confirm that the browser is not the limit; how the frame is spent is.

## 3. takram three-clouds and three-atmosphere (three.js, WebGL2)

**three-clouds** [S5]: Nubis-style volumetric clouds for three.js.
- **Temporal upscaling** marches 1/16 of the texels each frame.
- **Measured on a MacBook Pro M3 Max, Chrome, 4K, High:** 92–95 fps with temporal upscaling, **31 fps without**. Mac Studio M2 Ultra 4K: 60 vs 29–31.
- **Limits:**
  - ghosting in sparse clouds and on disocclusion;
  - seams on a cube-sphere, including at the poles;
  - at most 4 layers;
  - GLSL only.

**three-atmosphere** [S7] is Bruneton precomputed scattering, not Hillaire: Earth-fixed frame, horizon artefacts, no shafts. Not a drop-in for us; a reference for packing LUTs.

**Adopt** the 1/16 temporal march (about 3× in their data). **Avoid** taking the libraries as they are: they assume an Earth-fixed frame and fixed layers.

## 4. Native planet renderers

| Game | How it stays cheap | Source |
|---|---|---|
| **Elite Dangerous** | Cube-sphere quadtree patches; compute shaders generate each patch from the planet ID; emulated doubles; flat patches with normal and colour maps beyond some LOD; lighting precomputed per patch; nothing stored | [S40] (V) |
| **Outerra** | Coarse real elevation refined fractally on the GPU to centimetres; textures generated per pixel from elevation, slope and curvature; logarithmic or reversed floating depth | [S42, S43] (snippet) |
| **KSP2** | "PQS+" quad-sphere; one profiled scene spent **29.94 ms of GPU time on terrain**, with 8 of the top 10 offenders PQS+ | [S41, S48] (snippet) |
| **Google Earth / Cesium** | C++ to WebAssembly on WebGL; hierarchical LOD by screen-space error (Cesium's default max error 16 px) | [S38, S39] (snippet) |

**Common thread** *(inference)*:
- Expensive generation is **cached per patch** until the LOD changes, not re-evaluated per pixel per frame.
- Detail follows **screen-space error**.
- Sky and cloud cost is **decoupled from resolution**.

Our terrain already bakes into a cube and two camera patches (the right idea). Our ground **noise** and **clouds** are still evaluated per pixel per frame (the expensive part).

**Avoid** KSP2's trap: CPU-built procedural meshes with heavy vertex data.
