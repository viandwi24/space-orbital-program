# Planet textures and the sky: KSP 1, KSP 2 and what we do (plan 364)

Checked 2026-10-22. The owner compared our home planet and space with KSP (`refs/ksp-planet-sky-reference/ref-46…48.jpg`, untracked). Kerbin from orbit is crisp and stable. It has clear biome colours, mountains with relief shading and sharp coastlines, and it never shimmers. The sky has a Milky Way band, faint nebula glow, and stars of varied size and colour. Ours is "black with small white dots" that twinkle.

## 1. How KSP 1 draws a planet

Sources: KSP forum threads on scaled-space textures and Kopernicus ([locating and editing planet textures](https://forum.kerbalspaceprogram.com/topic/115249-locating-and-editing-planet-textures), [Kopernicus textures from PQSMods](https://forum.kerbalspaceprogram.com/topic/132622-advanced-kopernicus-textures-from-pqsmods), [Kopernicus thread](https://forum.kerbalspaceprogram.com/topic/181547-181-1-please-fork-me-kopernicus-kittopiatech/page/62)), [RSS-Textures](https://github.com/KSP-RO/RSS-Textures), and the cubemap request thread ([could we get cubemaps](https://forum.kerbalspaceprogram.com/topic/194596-could-we-get-cubemaps)). Mod-community knowledge, not official documents. Treat sizes as typical, not exact.

- **Two representations of every body.**
  - **PQS** (Procedural Quad Sphere): a quadtree of terrain patches built near the camera from a height map plus procedural "PQSMods" (noise, craters, vertex colour maps). Only the vertex colours are exposed to the mods. The terrain shader then blends tiling detail textures by slope and altitude, with near and far tiling.
  - **Scaled space**: far away, the body is a low-poly sphere in a separate, scaled-down scene. It is textured with a **baked colour map and a baked normal map** (equirectangular, DXT-compressed; stock bodies around 2048×1024, RSS up to 8192×4096 or 16k).
  - The two cross-fade at a set altitude. From orbit you see the bake, which is why Kerbin is crisp and never shimmers: a mipmapped texture is filtered by the GPU, and nothing per pixel is procedural.
- **The bakes come from the same generator.** Kopernicus can export the scaled-space colour and normal maps from the PQS mods, so the orbit view matches the ground.
- **Relief shading from orbit** is the normal map, often exaggerated. The baked colour is a hand-tuned gradient per height and slope.
- **The sky** is a static skybox: six textures with the galaxy, nebulae and resolved stars painted in. It turns with the inertial frame and never twinkles. Mods (TextureReplacer, Distant Object) swap it for larger cubes.

## 2. How KSP 2 draws a planet

Source: Developer Insights #12, "Planet Tech" (Eric DeFelice, official KSP 2 dev diary; the page now returns 404, so this is the search summary and the community's reading of it).

- PQS is kept, but the planet mesh is built in **compute shaders** and drawn with an indirect draw. The data never returns to the CPU.
- Floating origin keeps vertex positions small near the ground.
- Texturing uses biome masks with tiling PBR detail sets (rock, grass, sand, snow) and triplanar projection on cliffs. A far "scaled" body is still a baked texture.
- **The sky** is an HDR cubemap with the galaxy and nebulae. Stars are part of the cube, with exposure handled by the camera.

## 3. Why our surface looks blurry or glittery

Our planet is a full-screen ray-marched pass (`tsl/planet-pass.ts` for WebGPU, `shaders/planet.glsl.ts` for WebGL). It reads:
- the biome map: an equirectangular RGBA8 image at 1024×512, generated on the CPU by `generatePlanetMap`. Its texels are 3.7 km, and its noise stops at about 10 km wavelength;
- the terrain height cube (texels about 0.9 km on high);
- procedural octaves from 1,024 m down, each faded in only at three pixels per wavelength.

What each altitude sees:

| View | Pixel footprint (1512 px at DPR 2, 60° fov) | What fills it | Look |
|---|---|---|---|
| Pad, 1–10 km | cm to 10 m | every octave, micro grass, fields | sharp; fine |
| 100 km, nadir | ~40 m | octaves 1,024…128 m, bump from screen derivatives | detailed but noisy |
| 100 km, towards the horizon | 0.2–5 km | **only the bilinear 3.7 km map**, all octaves faded | **blurry blobs, soft coasts** |
| 2,000 km and the map view | 1.5–3 km | **only the bilinear map** | **blurry, "basic", no relief** |

- **Blur.** No content between the map's ~10 km noise and the 1,024 m octave. From orbit, every coast is a bilinear contour of a 3.7 km grid, warped by a 2 km domain warp, so it looks smooth and soft. Hill shading (`reliefAmp`) fades out above a 160–200 m footprint, so mountains from orbit have only the terrain cube's gradient.
- **Glitter.**
  - The sea's sun glint and the ripple normals on pixel-sized waves (the Toksvig widening already helps).
  - The bump normal built from screen derivatives of `hM` in 2×2 quads. It flips per quad where the octave sits near its fade edge.
  - The stars. They are hashed cells with a smoothstep disc of `max(0.5 px, 0.02 cell)`. A star smaller than a pixel lights or misses a pixel as the camera turns, so it twinkles. `pow(hash, 14)` magnitudes give many near-threshold dots, which read as dizzying noise.
- **Cost.** Every orbit pixel still runs `surfaceAt` (the map's five fetches, six or more noise octaves, relief, rivers, lakes) only to fade most of it out.

## 4. What fits us (three r186, WebGPU with TSL, WebGL with GLSL)

1. **A baked sky.**
   - **Milky Way, nebulae and unresolved star haze.** These are low-frequency, so they are baked once into a small half-float octahedral map (512² or 1024², about 2–8 MB), mipmapped. An octahedral 2D map rather than a cube: one 2D texture, the same lookup in GLSL and TSL, and no cube-face conventions that differ between the backends. For smooth content its fold seams do not show.
   - **Resolved stars** are a procedural catalogue drawn analytically, which beats both a baked cube (blurry, and a one-texel star's brightness changes under bilinear sampling) and point sprites (WebGPU has 1 px points only). Each star is:
     - a Gaussian whose width is at least 0.7 px and grows with brightness;
     - energy-normalised, so its sum over pixels is the same wherever it falls, and it cannot twinkle;
     - coloured by temperature, from blue-white to orange, with magnitudes from a power law;
     - cut off at a faint limit, so there are no near-threshold dots.
   - It is still scaled by the existing `starVisibility` (dimmer in daylight, gone under a bright sky) and the exposure.
   - **License.** NASA SVS "Deep Star Maps 2020" (svs.gsfc.nasa.gov/4851, up to 64k EXR) is the best real all-sky map. NASA media is usually public domain, but the page was not verified, and ADR 0025 keeps the world asset-free and seeded. **Not used.** Procedural, with the band's plane and centre fixed for every world.
2. **A scaled-space bake of each body** (KSP's colour and normal maps).
   - Baked on the GPU from **the same `surfaceAt`** the ground uses, evaluated at the texel's footprint, so it is identical to the ground by construction.
   - Stored in a cube render target with real mipmaps: RGBA8 albedo with water in alpha, and RGBA8 normal.
   - Sampled with an explicit LOD from the pixel footprint, which is defined in non-uniform control flow (WGSL).
   - Mid octaves (16 km to 2 km), which are missing today, are added to the coast and colour in both paths, so coastlines are fractal at every scale. Their coast shift is capped inside the terrain's land margin (`TERRAIN_SHAPE.landStart`), so water never covers relief.
   - Where the footprint is larger than the bake's texel, the pass reads the bake and skips `surfaceAt`. Between 0.6 and 1.2 texels it blends, and below that the procedural ground runs as today. The orbit view gets crisper and cheaper.
   - Face size per preset, memory with mips (×4/3): low 512 (8.4 MB), medium 1024 (33.5 MB), high 2048 (134 MB).
3. **Caching.**
   - A GPU bake of 6 × 2048² texels is a few hundred milliseconds of GPU time. Reading 134 MB from IndexedDB and uploading it is slower and costs disk, so the "cache" for the bakes is the GPU texture, kept for the world's life and keyed by seed, zones and size.
   - What is worth IndexedDB is the CPU work. The 1024×512 biome map is about 4.5 M noise samples and a sort. It is stored by seed, zones and width (2 MB) and checked against a version number.
   - Bakes are deterministic: integer hashes, no time, no camera.
   - They are spread over frames (one cube face per frame) and run under the loading screen of plan 340 before the first frame is shown.
4. **Ground detail** (KSP 2's tiling sets, KSP 1's near and far tiling).
   - Procedural "detail textures" are generated once into a small 2D array: rock, grass, sand and snow, 256² tiling, RGBA8 with mips.
   - They are applied triplanar (three planar fetches weighted by the normal) only below a few km of footprint, faded in by footprint like the octaves, so they never alias.
   - They modulate the existing albedo, and do not replace it.

## 5. What we do not do

- **A PQS quadtree mesh.** Our ray-marched terrain plus patches (ADR 0044) already gives the near ground. Rewriting it is out of scope.
- **Runtime KTX2/Basis encoding.** Encoding on the client is slow. The repo ships a Basis transcoder (`copy-basis.ts`) for parts, but the bakes are created at runtime, so they stay RGBA8. Compressed textures pay only for shipped assets.
