# 03 — Renderer cost today, and what mods can and cannot change

Read-only audit of `main` @ 5c07a270 (2026-10-24). Paths are relative to the repo root; `R/` = `packages/renderer/src/`.

## A. The renderer today

### A1. The frame

WebGPU is the default (Settings → Renderer → Automatic picks WebGPU, else WebGL: `apps/web/src/lib/ui/SettingsDialog.svelte:139-142`). The WebGL2 renderer is still kept as a fallback. The WebGPU frame (`R/renderer-webgpu.ts:289-310`) runs these steps in order:

1. `model.prepareFrame`. This is CPU work: the snapshot is applied, the sun shadow is fitted around the vessel, and the sun always casts (`:293-297`, a workaround for a three r186 bug).
2. **The planet pass**, `planet.update(...)` (`R/tsl/planet-pass.ts`, about 2,650 lines of TSL). One `graph(mode)` builds five variants (`:2600-2614`):
   - `prepass`: a cone-march start per 4×4 block (`MARCH_BLOCK`, `R/terrain-model.ts:84`);
   - `half`: the pass at reduced size, written to an RGBA32F target with log depth in alpha;
   - `edge`: full-size pixels where the half texels disagree;
   - an upsample with RCAS sharpening that is aware of depth;
   - `full`, plus `bake` for the scaled-space bake.
   The pass is a full-screen sky + terrain + sea + clouds + air shader. It is sized by the **planet pixel budget**: 1.75 Mpx (`R/presets.ts:84`). On a 14" Retina screen (5.7 Mpx) it draws at 0.55 of the side and is upsampled.
3. **The moon passes**, one per craters body near the camera (`R/tsl/moon.ts`), and Lambert spheres for far bodies (ADR 0318 §6).
4. **The scene pass.** This is a TSL `RenderPipeline` (`R/renderer-webgpu.ts:152-177`):
   - `pass(scene)` with MSAA, capped at 2 from pixel ratio 2 (`R/presets.ts:90`);
   - `BloomNode` at a bloomScale of 0.25–0.5;
   - output = colour + glow, then ACES tone mapping and sRGB (`:208`).
   Shadows are PCF (`:210`), from a 2048/4096 map that is capped at 2048 on Retina (`R/presets.ts:94`). Meshes still on GLSL `ShaderMaterial` (plumes, plasma, smoke, orbit lines) are drawn through TSL "twins" (`R/webgpu-compat.ts:10`, `R/tsl/twins.ts`).
5. Overlays (mod shapes) and the map, drawn in the same scene.

`low` has `post: false` and draws straight to the canvas with no bloom and no MSAA (`R/presets.ts:111`).

### A2. Per pixel per frame vs baked

**Per pixel, every frame (planet pass):**

| Work | Cost knob |
|---|---|
| Sky LUT lookups | — |
| Air in front of terrain, marched on the LUTs | `viewSamples` 8/12/12 |
| Terrain height-field ray march | prepass `terrainSteps` 48/80/128, then refine 24/32/40 |
| Terrain sun shadow march | 0/5/8 |
| `surfaceAt` shading (biome map through coast warp, colour/coast octaves) | `groundOctaves` 8/9/11 |
| Seven-component sine-wave sea normal, shore swash/foam, rivers, lakes | — |
| Cumulus slab march | 3/4/6 steps, octaves 3/3/4, billow detail 1/2/3 |
| Cirrus shell | — |
| Light-shaft second march | 0/4/8 steps, with 0/2/4 terrain reads each |
| Aurora shell march | 0/8/12 |

Presets are listed low/medium/high (`R/presets.ts:105-203`). Every detail term fades by its own size against the pixel footprint (journal 261, "ground and sea noise").

**Every frame, not per screen pixel:** the LUT sky-view table, 192×108 at 32 samples a texel (`R/tsl/lut-sky.ts:8,54`).

**Baked (once, or on change):**

| Resource | Size and source | When it is rebuilt |
|---|---|---|
| Transmittance LUT | 256×64 | once |
| Multiple-scattering LUT | 32×32 | once |
| Biome map | 512/1024 wide, equirect, generated on the CPU in 555 ms, cached in IndexedDB (journal 364) | per world |
| Terrain height cube | 512/768/1024 faces | per world |
| Camera terrain patches | fine 4,096 m and mid 32,768 m windows at 512/1024 texels (`R/terrain-patch.ts:13`) | when the camera re-centres |
| Scaled-space albedo + normal atlas | 512/1024/1536 faces (`R/scaled-space-model.ts:8-14`) | when the heights or the map change |
| Cloud map | equirect | when the cover changes |
| Octahedral Milky-Way sky map | 512²/1024², half float | once |
| 60k analytic catalogue stars | Gaussians drawn per pixel | — |
| Detail tiles | 256² RGBA8 on the CPU (`R/detail-textures.ts:10`) | once |
| PMREM environment | 128 | — |
| Body-look maps | 512×256 on the CPU (`R/body-look.ts:16`) | — |

Shader builds happen at load or in the background, never in a frame (ADR 0308, ADR 0310).

### A3. Measured costs and fps on the M5 Retina (1512×945 CSS at 2×)

The best data comes from three sources.

**1. WebGL, after plan 252** (`refs/graphics-performance/07-m5-baseline.md` §4, run 5). Sync ms, from the 3024×1890 canvas:

| Preset | pad | 3 km | 12 km | orbit |
|---|---|---|---|---|
| high | 16.5 | 15.1 | 16.8 | 9.9 |
| medium | 13.6 | 13.1 | 14.5 | 9.3 |

- Governor on, `high`: 56.8 fps average, p95 25 ms, 12 % of frames over 16.7 ms.
- Before plan 252, `high` at ratio 2 read 43.7–50.4 ms.

**2. WebGPU, M5, `high`, ratio 2** (journal 364). GPU ms, median of `benchmarkAsync`:

| View | GPU ms |
|---|---|
| Pad at night | 18.2 |
| Orbit 100 km | 21.1 (15.7 with the bake used everywhere) |

The same views on WebGL read 42.9 and 60.7.

**3. The owner's M5 on battery, orbit 100 km** (ADR 0304 and plan 362):

| Setting | fps |
|---|---|
| Medium, adjust off | 100 |
| Automatic, before plan 362 | 25 (governor spiral) |

After plan 362 the governor steps presets and is unit-tested to settle on a fixed preset. **It has not been re-measured on the M5 at 120 Hz** (journal 362, "Not verified").

**M2 Retina, WebGPU** (research `frame-budget-and-efficiency.md` §1). This is the clearest picture of where the time goes:

| Preset | GPU timestamps | Frame interval | fps |
|---|---|---|---|
| high | 6–9 ms | 32 ms | 39–55 |
| medium | 6.1 ms | 16.7 ms | 60 |

Two findings stand out:
- Without the planet pass the frame is 1–3 ms of GPU time (journal 261 Phase 2 step 10).
- On Apple tile GPUs the timestamps miss the end of a full-size frame: the resolve, the present and the canvas copy (ADR 0248).

**The per-feature breakdown** (plan 251 ablation, WebGL, ratio 2, `07` §2). No `high` extra costs more than 2.6 ms on its own. After plan 252 they all sit within ±1.1 ms, except MSAA (−1.9 ms). Together the extras are about 25 % of the frame; the other ~70 % is pixels.

### A4. Biggest remaining costs

1. **The frame end at Retina on Apple GPUs** (MSAA resolve, half-float target, pass count). This is what keeps `high` at ratio 2 off 60 fps. Draft plan 368 has untried options: MSAA 2→0 + FXAA, an RGBA8 post target, folding passes, opaque alpha.
2. **The planet pass's pixels.** It is already budgeted and drawn at 0.55 of the side on Retina. Inside it, the cost goes to the march, the clouds, the shafts and the aurora, each 1–2.6 ms.
3. **Shadows.** Every caster is redrawn every frame. Draft 369 would cache the static site.
4. **Draw calls.** About 350 for Kronos V + Selene at `medium`, with the shadow pass repeating most of them, and no `BatchedMesh` (draft 367).
5. **Load and compile.** One planet pipeline is the critical path: 14.6 s on the owner's Windows D3D machine (draft 374).
6. **CPU.** About 3.5–5 ms a frame, and the main thread is idle on the M2. Allocation is about 1 MB a frame, mostly HUD and zod.

### A5. The governor (`R/quality-governor.ts`)

It is a pure state machine fed the rAF interval, and on WebGPU the GPU timestamps as well. Its target is a locked 60 fps, or 30 when 60 is out of reach.

- **The ladder** (`:31-80`). It starts at the player's preset (the ceiling) and steps down:
  - render scale 1 → 0.85 (`PRESET_FLOOR_SCALE`, `:48`);
  - then the next preset down at 100 %;
  - only the last preset goes on to the half-planet rungs and 0.7 → 0.55.
  With the pixel budget active on Retina, the half rungs are dropped.
- **Its rules:**
  - a drop needs half the frames to be over, or a steady judder (10 % over across 5 s);
  - two rungs drop at once when p95 is over 2× the budget;
  - per-scene trial bans: a rung that failed is not retried in that scene;
  - dwell times;
  - work time calibrated against the interval;
  - a hold until the background precompile resolves (plan 373);
  - a frame-cap aware pace (Display/60/30);
  - the learned level is saved per backend.
- A governed step keeps the resource sizes (map, terrain, patches, shadow side; `R/presets.ts:245-253`), so no rebake and no shader build happen.

### A6. Feature inventory

| Feature | Exists? | Quality / model |
|---|---|---|
| **Re-entry heat glow** | Yes, two layers | **Part skins:** blackbody emissive ramp from 650 K (deep red) through orange and yellow to white at 4000 K (`R/effects/glow.ts:8-17`), driven by the sim's `PartSnapshot.temperature`. Materials are cloned per hot part (`R/parts/factory.ts:282`). **Plasma shell:** an additive shader mesh shaped from the vessel silhouette, with a Mach-dependent shock stand-off (`R/effects/plasma-shape.ts:61,158`) and a streak behind. The colour follows speed through `ionisationColour` (`R/effects/look.ts:84`): orange below 4 km/s → yellow-white at 7 → pink-white at 7.8 → blue-white above 10. Intensity uses the Sutton-Graves flux (`R/effects/reentry.ts`). Radio blackout is modelled. Bloom picks it up. |
| **Aero / condensation** (vapour cones, Prandtl-Glauert, wingtip vortices, contrails) | **No** | Nothing in `R/`. Related effects that do exist: exhaust trail ribbons in the air column (ADR 0080), and lit smoke and dust billboards (ADR 0047). |
| **Engine plumes** | Yes | Two nested additive shader cones plus a nozzle glow sprite (`R/effects/plume-mesh.ts`). The shape comes from the isentropic expansion factor `(pe/pa)^(1/2γ)`: narrow and long with shock diamonds at sea level, wide in vacuum (`R/effects/plume.ts:1-7`). Also: ramp-up flash, per-bell clusters, an optional `color`, and a ground-light disc. RCS puffs are separate. No volumetric or particle-based core, and no heat haze. |
| **Ocean** | Yes, analytic | Seven deep-water sine components with real dispersion (`R/water-model.ts:24-32`), as a normal only with no displacement. Also: shore swash and surf bands, foam, lakes, rivers with flow ripples. Footprint fading and Toksvig-widened sun glint. **Reflection is Fresnel × a single uniform `uSkyColour`** (`R/tsl/planet-pass.ts:~2222`): no environment or SSR reflection, so clouds, vessels and the sun disc do not appear in the water (only the glint does). No underwater view. Only the home planet has a sea (`writing-a-mod.md:216`). |
| **Atmospheric scattering** | Yes | On WebGPU, a Hillaire LUT sky: transmittance 256×64 (Bruneton mapping), multiple scattering 32×32, sky-view 192×108 per frame. It covers Rayleigh, Mie and ozone. The air in front of terrain is marched 8–12 steps on the tables. On WebGL, a per-pixel march with a 2.2 boost. **No aerial-perspective froxel volume** (deferred, ADR 0248). Other bodies get Rayleigh/Mie tints from `appearance.sky/haze`. |
| **Terrain detail** | Partial | The ground is a **ray-marched height field** (baked cube + camera patches), not a mesh, so there is no tessellation. Colour is procedural (biome map + noise octaves + mid octaves from 16 to 2 km). Normals come from the slope via screen derivatives, the analytic gradient and macro-relief; there are **no normal maps**. Below an 8 m footprint, four procedural greyscale triplanar detail tiles (rock, grass, sand, snow) are added (journal 364). Scatter: instanced trees (250–2,000) and grass tufts (0–28k) at the launch site only. Instanced **stones on craters bodies only** (`R/moon-stones.ts`, 320/80 tri). No rocks or vegetation elsewhere on Home. |
| **Clouds** | 2.5D | A cumulus slab of 1,100 m above 3,500 m, ray-marched in 3–6 steps over a **2D coverage field** with a height profile, erosion octaves, powder and a multi-scatter stand-in. It casts shadows on the ground from a baked map. Cirrus is a thin shell at 9.5 km (`R/cloud-model.ts:17`). **No temporal reprojection** (Phase 7 deferred) and **no weather**: cover is a constant 0.42 (`R/environment.ts:158`), and the deck only drifts by rotation. Other bodies get an `appearance.clouds` Lambert deck. |
| **Planet from orbit** | Yes | A scaled-space bake of the planet pass's own `surfaceAt` into an albedo + normal cube atlas: 512/1024/1536 per face, about 0.6–1 km a texel on the 600 km Home. It is read when a pixel covers more than 1.2 texels. Biomes are procedural (grass, forest, desert, rock, alpine, snow, beach, wet sand, sea shades) and there are no image textures. Other bodies are 512×256 CPU palette maps in five patterns (`R/body-look.ts`). There are no city lights. |
| **Other** | | Light shafts (cloud and ridge cast), aurora, a baked Milky Way and stable stars, bloom, ACES, auto exposure, PCF sun shadow, a 4×4 terrain-shadow march, weathered site materials (`R/weathering.ts`), floodlights, steam. |

### A7. Quality settings exposed to the player

Settings → Graphics (`apps/web/src/lib/ui/SettingsDialog.svelte:129-142, 217-295`):

- **Quality:** Automatic / Low / Medium / High. There is no `ultra`.
- **Brightness:** −100 % to +100 %.
- **Renderer:** Automatic / WebGPU / WebGL. Changing it reloads.
- **Frame rate limit:** Display / 60 / 30.
- **Adjust quality while playing:** governor on/off.

Elsewhere:
- Time → Debris kept.
- Reduced motion, which removes flashes.
- The loading screen's "Continue with lower quality".

The per-feature switches (`debug.setFeature`: shadowMap, clouds, shafts, terrain, aurora, tufts, msaa) exist only in debug.

## B. Mods and the renderer

### B1. How mods load

- **A package** is one JSON file, `*.orbital-mod.json` (ADR 0057). It holds:
  - the manifest;
  - **one bundled ES module** as text, whose default export is a `Plugin`;
  - a SHA-256.
  Format 2 adds base64 `.glb` assets (ADR 0076); format 3 adds PNG/WebP images (ADR 0313).
- **Build:** `tools/mod-build/build-mod.ts`. The bundle has `@orbital/sdk` shimmed to the host's copy.
- **Install:** a file or an https URL with CORS, then a trust prompt (id, version, author, API range, deps, size, fingerprint, the asset list). The package is stored in IndexedDB `orbital-mods`.
- **Load:** the code is imported via a `blob:` URL in **both the page and the sim Worker**, then `resolveMods` → `loadPlugins` (`packages/core/src/plugin.ts:419`).
  - `setup(ctx)` is synchronous and registers definitions.
  - Changing the mod set needs a page reload.
- Plain data (parts as JSON) validates the same way, but code is still the container.

### B2. What mods can register

Registrars are listed at `packages/core/src/plugin.ts:111-205`, and `REGISTRY_KINDS` at `:217`. They cover:

- parts, modules, resources, **bodies**, systems and system variants;
- rules, presets, charges;
- objectives, contracts, contract templates, missions, strategies, agencies, discovery facts;
- data kinds, action groups;
- **buildings**, site templates;
- science (situations, experiments), comms (antennas, ground stations, bands, route policies);
- dossier entries, categories, achievements, tech nodes, commodities, recipes, failure modes;
- scenarios, **blueprints**;
- **panels** (dock UI as data, plus a 2D canvas `draw`), autopilots, stores, keybindings;
- **overlays**;
- crew traits, names, outfits, looks, expressions, animations and portraits;
- typed **patches** over other plugins' data (ADR 0170).

**There is no lessons registry yet.** It is planned (ADR 0311 table), and so is a `loadingShots` registry.

### B3. Visual content a mod can supply today

| Asset | Status | Details |
|---|---|---|
| **glTF parts** | Yes | `visual.asset: 'models/x.glb'`, with an optional `lods` (1–3), `deploy` clip, `materials` → palette slots, and a `moving` node for articulation. Plume, heat glow, shadows and icon work as for generated parts (guide `writing-a-mod.md:1068-1091`, ADR 0076/0160). **Limits:** `.glb` only; 2 MiB per model, 6 MiB and 32 files per package; 50k triangles; 32 mesh nodes; 8 embedded textures, which may be PNG, JPEG or KTX2 (`KHR_texture_basisu`, transcoder served from `/basis/`); no Draco, Meshopt, WebP or external URIs. Materials are the glTF PBR metallic-roughness ones. `visual.kind` is a required fallback generator. (The guide's "Open items" line `:1104` still says KTX2 and deploy clips are "not built"; that is stale against ADR 0160 and `:1083-1086`.) |
| **Procedural part looks** | Yes | A closed set of generators by `visual.kind`, plus palette, params and `livery` (`packages/core/src/schemas.ts:355`). Plume data includes `color`. |
| **Images** | Narrow | PNG/WebP up to 512 KB in `assets/`, **used only for crew portraits**. System and preset card art are `data:` URLs up to 128 KiB. |
| **Bodies / planets** | Data only, closed sets | `terrain` is one of: `hills` (the Home continents, reusing Home's biome map; a `seed` gives other continents), `craters` (seed 0–999, with `small`), or a smooth sphere (`schemas.ts:89`). `appearance` is `palette` (1–6 hex), `pattern` (mottled / polar-caps / lineae / volcanic / bands), `sky`, `haze`, a `clouds` deck and `rings` (`schemas.ts:105-139`). **No albedo, height or normal textures and no height function.** A second `hills` body draws without sky, haze, sea waves or clouds (`writing-a-mod.md:216`, draft 071). |
| **Buildings** | Registered, generic look | A mod building has no look of its own: it falls back to a generic block, because building meshes are a renderer engine keyed by `kind` (`R/site-buildings.ts:685-688`, ADR 0311 table). |
| **Shaders, post effects, atmosphere, clouds, plumes** | **No** | Mods may import only `@orbital/sdk`, never three or the renderer (`writing-a-mod.md:7`). The guide says "a mod cannot add geometry or shader code" (`:1064`). ADR 0311 keeps generators, shaders and painters as "engines" and lists mod-defined generators as "not planned". |

### B4. What renderer context a mod gets

- **No renderer, scene, camera, three object or GPU device** is reachable.
- The only renderer-facing channels are data:
  - **overlays:** polylines, markers and labels in the inertial or body-fixed frame, with depth test or on-top. Budgets are 64 shapes, 4,096 points and 16 labels. The renderer owns the meshes (ADR 0296, `writing-a-mod.md:783-808`).
  - **panel canvas:** a 2D draw callback in the dock UI.
  - **part visual descriptors and glTF bytes**, which the renderer reads.
- Effects (explosions, plasma, staging) are inferred by the renderer from snapshots; mods have no hooks into them.

### B5. Security and sandbox constraints

- **Mods are not sandboxed.** They run with the page's (and Worker's) privileges: saves, storage, network (ADR 0057 §6). The only protection is the pre-execution trust prompt and the fingerprint over code and assets (ADR 0076 §2).
- Player scripts, unlike mods, run in an opaque-origin iframe sandbox (ADR 0038).
- Assets are inert data:
  - they are checked by `inspectGlb` before the prompt;
  - embedded images load as `blob:` URLs, and the CSP needs `blob:` in `img-src`/`connect-src`;
  - an SVG card image is drawn as an image, so its scripts never run.
- Mod-supplied WGSL/TSL would therefore not add a *privilege* (mods already run arbitrary JS). The real risks are elsewhere:
  - GPU hangs and device loss (already handled by a rebuild);
  - pipeline compile time (the ADR 0308/0310 load contract);
  - the 16 sampled-texture limit in the planet pass (journal 364).

### B6. Gaps

**1. Planets with textures.**
- Needed:
  - body fields for albedo, height and normal images (equirect or cube), plus optional biome, ocean and cloud masks;
  - image asset types beyond portraits, with larger caps: a 512 KB PNG is far too small for a planet map, and 6 MiB per package is tight;
  - KTX2 or other compressed textures outside glTF.
- The renderer would have to feed a mod heightmap into the terrain cube bake and the sim's `createBodyTerrainField`. The sim needs the same heights for collision, so a height texture is gameplay data, not just a look.
- The planet pass's bindings would also have to cover non-Home `hills` bodies, which today get no sky, sea or clouds.
- ADR 0311 says "mods add planets as bodies with their own maps", but no image-map path exists.

**2. Parts with glTF and textures.**
- Mostly there. Missing:
  - WebP/AVIF and Meshopt/Draco;
  - emissive or animated materials beyond glTF PBR, for example engine-bell heat glow by throttle;
  - a per-part custom plume look (only shape numbers and `color`);
  - glTF buildings (the Space Center draws generator buildings only; ADR 0160 §5);
  - shared textures across parts (each `.glb` embeds its own).

**3. Visual mods** (atmosphere, clouds, plumes, post).
- Nothing exists. There is no registry for render techniques, and mods cannot import three or TSL.
- A visual-mod API would need its own design:
  - **Data-only parameter packs** (the cheapest): atmosphere coefficients, cloud cover, altitude and type, plume colour ramps, bloom and exposure, tone-map choice. These are uniforms that already exist.
  - **Declarative node graphs or presets**, validated and compiled by the host.
  - **Trusted TSL modules** with a fixed hook interface (for example `cloudDensity(p)` or `plumeShade(...)`), in a slot the renderer compiles and warms at load (ADR 0310). Each needs a WebGL2-fallback story or a "WebGPU only" flag.
  - **Post-process nodes** appended to the `RenderPipeline.outputNode` chain (`R/renderer-webgpu.ts:168-174`) with a pixel-cost budget the governor can turn off.
- Every hook adds pipelines. Under ADR 0308/0310 they must be built at load and warmed per preset, and governor steps must not compile them.
