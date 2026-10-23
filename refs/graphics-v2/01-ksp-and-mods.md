# 01 — How KSP 1, KSP 2 and their visual mods get the seven target looks

Researched 2026-10-24 (web, standard search; sources at the end). This adds to, and does not repeat:
- `refs/graphics-performance/03-how-others-do-it.md` (takram clouds' 1/16 temporal march, Elite, Outerra, KSP2 PQS+ GPU cost, Cesium);
- `refs/graphics-performance/04-techniques.md` (Hillaire LUTs, cloud amortisation, pixel budget);
- `docs/research/planet-textures-and-sky.md` (KSP 1 scaled space, Kopernicus bakes, KSP 2 compute PQS, baked sky);
- `docs/research/effects-3.md` (plasma physics, blackout, contrails).

**Evidence grades.** Many mod pages (KSP forum, Patreon) returned 403, and the KSP 2 dev diaries now 404. Where a claim comes only from a search-engine summary of such a page, it is marked *(snippet)*. Claims from community knowledge that no fetched page confirmed are marked *(unverified)*.

## The pattern in one paragraph

KSP 1 shipped with little, and **mods** supplied each look:
- Firefly: re-entry;
- Waterfall: plumes;
- Scatterer: sky and ocean;
- Parallax: terrain;
- EVE and blackrack's volumetrics: clouds;
- TUFX: post-processing;
- Deferred: lighting.

Every one of those is a **renderer replacement** that hooks Unity's cameras, and they often break each other: compatibility tables, load order, DX11-only. KSP 2 then **built the same ideas in**. Its cloud and atmosphere work was written by the author of Scatterer, Deferred and the volumetric clouds, Ghassen "blackrack" Lakhal (Dev Insights #22, *snippet*).

The common thread is that the **technique** lives in the engine and the **look** lives in data:
- per-body colour tables;
- per-engine templates driven by controllers;
- per-body cloud and scatter configs.

That split is what we should copy.

---

## 1. Re-entry heat (red, blue, pink plasma)

| | Stock KSP 1 aero FX | Firefly (KSP 1) | KSP 2 |
|---|---|---|---|
| Technique | Part geometry extruded along the airflow and drawn with an FX shader; white (condensation) below a Mach threshold, orange above. Part keys `aeroFXStartThermalFX` and `aeroFXVelocityExponent` *(snippet; internals unverified)* | Replaces stock completely. Shader "based on Leah Lindner's paper" (the paper was not found). Layers: a surface **glow** and **glow_hot**; a double **trail** (primary, secondary, tertiary colours plus random **streaks**); a fresnel **wrap layer** around the craft; a **bow shock** (a copy of the windward side of the part); sparks and particle sprites above a speed threshold | A custom shader that emits "flames" from an **envelope mesh** around each part |
| Colour | Fixed | **Per body**, set in the body config. Each colour is RGB × 2^intensity, so colours are HDR. A "periodic table of plasma colours" and atmosphere compositions are given to config authors (Kerbin O/N → pink/blue; Duna and Eve CO₂ → other hues) | Fixed heat texture |
| Cost tricks | — | "Mostly on the GPU"; can match or beat stock. Trail triangles are generated each frame. Optimised by JonnyOThan | Envelope **LOD**: three meshes (~5k / 2k / 1k faces for a large part), switching at 50 % / 25 % / 0 % screen size |
| Knobs | — | Per body: `strength_multiplier`, `length_multiplier`, `opacity_multiplier`, `glow_multiplier`, `wrap_opacity_multiplier`, `wrap_fresnel_modifier`, `particle_threshold` (m/s), `streak_probability`, `streak_threshold`. Per-part colour overrides; custom envelopes; an in-game editor | Envelope LODs per part |
| Known problems | Visible triangles and flicker on many parts *(snippet)* | The bow shock copies the windward geometry, which adds odd detail (issue #9). RSS Earth uses Kerbin's numbers although its atmosphere is twice as deep | Each part needs a hand-made, voxel-remeshed envelope (~10 % larger than the part) |

**Recommendation: built in, with settings.** Our plasma shell already comes from the vessel silhouette (ADR 0078).

What to borrow from Firefly is its **data model**:
- a per-body colour table (glow, glow_hot, trail 1/2/3, streak, wrap, shock), each with an HDR exponent, picked from the atmosphere's composition;
- strength driven by our existing stagnation flux;
- a **per-body plasma palette as mod data**. That is the only mod hook needed; it is how the owner's red, blue and pink come out.

Quality knobs: trail segments, particle count (0 on low), and the bow-shock layer on or off.

## 2. Aero and condensation effects (shock collars, vapour)

- **In KSP:**
  - Below the thermal Mach threshold, the stock aero FX draws the same extruded shell in white, so condensation is the cold end of the re-entry effect *(snippet)*.
  - Firefly unifies both effects in one system with one strength value; the `particle_threshold` gates sparks.
  - No KSP 1 mod we found models Prandtl-Glauert vapour cones physically. Waterfall's **Mach** controller is used by plume authors for shock effects.
- **Cost:** one extra transparent shell per part. Firefly and KSP 2 both keep it cheap with **one mesh per part, LOD'd**, not particles.
- **Recommendation: built in, with settings.**
  - Reuse the plasma shell's geometry with a cold, white, low-opacity palette between about Mach 0.85 and 1.2, plus a thin ring at the shock (a vapour cone).
  - Fade it by density and humidity proxies (we have pressure only; ADR 0080).
  - It needs no new pass. Quality knob: on or off.

## 3. Engine plumes

| | Waterfall | RealPlume (with SmokeScreen) |
|---|---|---|
| Technique | "Mesh-driven" continuous effects: each effect = **model** (cylinder, cone, billboard, or skinned mesh) + **material** (Additive, Alpha, Distort; "Dynamic" variants; Additive Directional; **Additive Volumetric**, which reads the depth buffer to fade where it meets parts and ground) + **controllers** + **modifiers** (float, colour, UV scroll, transform) | Particle systems (SmokeScreen) with polished per-engine plume presets |
| Driving data | Controllers read: throttle, normalised thrust, **atmosphere density** (density^0.5128 by default; this widens the plume in vacuum), Mach, gimbal, RCS, engine events (ignition and flameout curves), velocity, random or Perlin noise, light intensity, remap curves | Pressure: plumes expand as pressure falls |
| Cost tricks | No particles: a few meshes per engine, shader-animated by UV scroll and noise. v0.9.0 shipped "a significant stack of performance updates" for ships with many effects | — |
| Knobs | `WaterfallSettings.cfg`: turn off **lights** and **distortion** when many engines lag (StockWaterfallEffects advice) | Particle counts per preset |
| Known problems | Additive shaders look poor at grazing angles; the volumetric shader needs depth; many engines × lights × distortion is slow | Particle overdraw; it is mostly superseded by Waterfall |

**Recommendation: built-in technique, with mod-provided templates.**
- **The engine provides:**
  - a small fixed set of plume shaders (additive core, Mach diamonds, volumetric-ish fresnel shell with soft depth fade);
  - the controller inputs (throttle, ambient pressure, Mach, ignition time).
- **Mod data provides** per-engine templates: mesh choice, colours, curves. This matches ADR 0057/0076, where mods carry data and GLB, not shaders.
- **Cost guard:**
  - one point light per **cluster**, not per engine;
  - distortion only at `high`;
  - plume LOD by screen size (the core only when far away).

## 4. Ocean and atmospheric scattering

**Scatterer (KSP 1)** is a Unity port of **Proland**, i.e. Bruneton's precomputed scattering and ocean.
- **Atmosphere.**
  - Each body is defined by Rayleigh `m_betaR`, Mie `BETA_MSca`, scale heights `HR` and `HM`, radii `Rg` and `Rt`.
  - The tables are **precomputed** (in game since 0.0824; DX11).
  - Only `m_mieG` can change without regenerating them.
  - Look-only knobs that work on top of the tables: `skyExposure`, `scatteringExposure` (terrain), extinction tints, per-altitude **config points** interpolated between.
  - `flattenScaledSpaceMesh` hides the edge artefacts of the scaled-space body.
- **Ocean.**
  - An FFT ocean with `m_fourierGridSize` 64, 128 (the "sweet spot") or 256 (best).
  - The ocean is called "one of the most performance taxing features".
  - Sky reflections are "negligible"; craft and wave interaction "isn't performance-intensive" (async GPU readback).
  - Extras: shadows on the ocean, caustics, underwater light rays, eclipses, ring shadows, godrays (cost tied to shadow-map resolution and distance).
- **Known problems:**
  - DX11-only features;
  - per-planet tables must match the config;
  - horizon and scaled-space seams;
  - flicker fixes needed with Unity's DX11 shadows.

**TUFX** also ships a Bruneton "Scattering" post effect (it disables the stock skybox) and a WIP ocean. The community uses Scatterer instead.

**KSP 2** (Dev Insights #22, *snippet*):
- atmosphere **transmittance is applied to sunlight and to clouds**, which gives warm direct light and bluish ambient light;
- patch 0.1.5 improved scattering on terrain and clouds and cloud–atmosphere blending.

**Recommendation: built in, with settings.**
- We already planned Hillaire LUTs (`04-techniques.md` §2). Hillaire beats Bruneton for us: the LUTs are small, rebuilt per body in milliseconds, and need no offline tables per config, which Scatterer suffers from.
- Copy two Scatterer ideas:
  - a separate **terrain inscatter exposure** next to the sky's;
  - **per-altitude config points** for the look.
- Ocean, in order of cost:
  1. a normal map scrolled in two directions (our ripples) with Toksvig;
  2. a 64² FFT in WebGPU compute at `high`;
  3. never more than 128².
- Mods supply only the atmosphere coefficients and the ocean colours.

## 5. Terrain detail and scatter rocks

**Parallax / Parallax Continued (KSP 1).**
- **Technique.** A replacement terrain shader:
  - **hardware tessellation with displacement**;
  - biplanar mapping;
  - PBR textures blended by slope and altitude;
  - "influence maps";
  - emissive;
  - on-demand texture loading.
- **Tessellation** is capped at 64 by the hardware, and KSP's quads are too big for that, so Parallax **subdivides the quads on the CPU** near the camera.
- **Scatter:**
  - **compute shaders** generate "millions of objects almost instantly";
  - each type is drawn with **GPU instancing**;
  - **per-object frustum culling**;
  - the newer version processes only visible quads and cuts compute VRAM.
- **Knobs** (`ParallaxGlobal.cfg`):

| Knob | What it does | Cost |
|---|---|---|
| `edgeLength` | 6–10 recommended; lower means finer far detail | High |
| `range` | Tessellation distance | Moderate |
| `maxTessellation` | ≤ 64 | Moderate |
| `tessellationQuality` | Low ×0.75 … Higher ×1.5 of the planet's subdivision | High |
| `reflections`, `refreshRate`, `resolution`, `timeSlicing` | Probe reflections; `IndividualFaces` renders one cube face per frame | High |
| `tessellateLighting` | Tessellation in ForwardAdd lighting passes | High |

  Scatter density and range multipliers exist, but their names were not confirmed.
- **Known problems:**
  - scatters **regenerate whenever the floating-origin offset changes** (map view, vessel switch);
  - density × 5 on rescaled systems stutters;
  - 10 fps on the Mun on an AMD Vega;
  - Mac only through CrossOver, Linux only on DX11 via Proton;
  - 8× MSAA plus Parallax VRAM is very slow.

**KSP 2** builds the PQS mesh in **compute**, with an indirect draw. Height, slope and cavity are computed per vertex for procedural texturing. The team says GPU tessellation "wouldn't give much control over terrain height" (Dev Insights #12, *snippet*). The cost is in `03-how-others-do-it.md` (29.9 ms terrain).

**Recommendation: built in, with settings; mods supply data only.**
- WebGPU has **no tessellation stage**, so Parallax's core trick is unavailable. Our equivalent is the camera-centred patches (ADR 0044) plus a footprint-faded detail normal and albedo (plan 364 §4).
- **Scatter rocks:**
  - a WebGPU **compute pass** fills an instance buffer per patch from the same seeded hash (deterministic, so no regeneration when the origin moves: key the instances to body-fixed cells, not to the floating origin);
  - culled per cell, drawn by `InstancedMesh` or an indirect draw;
  - 2–3 LODs, with a far **impostor** or nothing beyond ~2 km;
  - the WebGL2 fallback places the instances on the CPU in a worker, at a lower density.
- **Knobs:** scatter density (0 / 0.5 / 1), scatter range, detail-texture on or off.
- **Mods:** rock GLBs and per-biome scatter tables.

## 6. Volumetric weather and clouds

| | EVE / EVE Redux (KSP 1) | blackrack "True Volumetric Clouds" (KSP 1, Patreon, EVE fork) | KSP 2 clouds (blackrack, Dev Insights #22) |
|---|---|---|---|
| Technique | **2D layers** (a main cubemap or equirect texture plus a tiling detail texture close up) that are always visible. Close up, "volumetric" = **particle billboards** inside ~10 km, multiplied by the main texture, fading in before the visible range to avoid popping | **Raymarched** volumetric layers with 3D noise; cloud types and formations (convective puffs since release 5, Sept 2025); rain, puddles, cockpit droplets that deform with speed (release 3, Aug 2023); lightning and snow *(mirror only, unverified)* | **Raymarched**: density and colour sampled per step, lit with atmosphere transmittance |
| Cost tricks | Redux: all particles of a layer in **one draw call** and one renderer; particles drawn at **¼ resolution, depth-aware upsample**; cloud and eclipse shadows **from the depth buffer** instead of re-rendering with projectors. +20…200 % fps. `layerVolume.visibleRange` (default 10 000) culls far volumetrics | **Low resolution plus temporal upscaling**; release 3: "less blurring and trails", "no flicker or jitter in orbit". Like KSP 2 *(inferred: same author)* | **Low resolution plus temporal upscaling** since 0.1.5: a different subset of pixels each frame, "similar to checkerboard rendering but not limited to half resolution"; **dynamic resolution for clouds**; optimised cloud shadows; CPU cost of clouds cut later |
| Knobs | Per layer: textures, altitude, detail scale, particle density, visible range | Quality presets *(unverified names)* | Graphics quality; dynamic resolution |
| Known problems | Billboard look; cost of draws and particles (fixed in Redux) | Ghosting and trails in motion (improved over releases); heavy GPU and RAM; pixelated puddles (fixed March 2026); paid early access | Ghosting; GPU cost |

**MSFS 2024** (forum reports only, *anecdotal*):
- clouds look **voxel-like**, coarser on low settings;
- low-resolution clouds leave **depth-comparison halos** around aircraft and propellers;
- temporal upscaling **smears** when the camera moves fast;
- users believe SU5 lowered cloud resolution for performance.

Those are the failure modes to design against.

**Recommendation: built in, with settings.** This is the most expensive look.
- The pass:
  - a raymarch at ≤ ½ resolution;
  - **temporal reconstruction of 1/4 to 1/16 of the pixels per frame** (KSP 2 and takram agree);
  - a **depth-aware upsample** (EVE Redux);
  - shadows from our baked cloud map (ADR 0086), not a second march.
- Keep **2D layers** (our ADR 0037 layers) as the orbit and `low` path. EVE's lesson is that 2D-from-far plus volumetric-near with a cross-fade is cheap and reads well.
- Guard the known artefacts:
  - reset the history on camera cuts;
  - clamp the history by neighbourhood (anti-ghosting);
  - upsample with nearest depth at aircraft edges.
- **Mods supply data:** per-body coverage and type maps, colours, and the rain or snow altitude.

## 7. A planet seen from orbit

- **KSP 1 plus Kopernicus.**
  - Far away, a body is a **baked scaled-space colour and normal map** (see `planet-textures-and-sky.md` §1).
  - Kopernicus **OnDemand** loading keeps only nearby bodies' textures resident: one 2018 report saw RAM fall from 5.0 to 4.2 GB.
  - RSS-Textures v13 extended OnDemand to non-home bodies.
  - Scatterer adds the limb glow; EVE adds 2D cloud cubemaps and city-light emissive maps.
  - Parallax Continued "Release 3" re-bakes **orbit textures** to match its terrain.
- **KSP 2:** baked far textures as well, plus atmosphere-lit clouds.
- **Space Engine** (0.990 changelog and blog, *snippet*):
  - **meshless terrain**: the vertex shader fetches height from texture arrays;
  - biome and soil materials;
  - a screen-error LOD metric, with loading prioritised to nearby nodes;
  - the atmosphere moved from O'Neil to **Bruneton precomputed** scattering.
- **Outerra:** see `03` (fractal refinement on the GPU, per-pixel procedural texturing).
- **Recommendation: built in.** Plan 364's GPU bake of a scaled-space cube is the KSP answer done better: it is generated from the same `surfaceAt`, so there are no mismatched bakes, which is the classic Kopernicus complaint.
  - Add an **emissive night-lights channel** in the bake and a **2D cloud cube** at orbit distance.
  - Load bakes **on demand per body**: bake on approach, evict far bodies (Kopernicus OnDemand).
  - Knob: bake face size 512 / 1024 / 2048.

## Post and lighting (cross-cutting)

- **TUFX** brings Unity Post-Processing v2 into KSP, largely unmodified:
  - AO, auto-exposure, bloom, chromatic aberration, colour grading and tonemapping, DoF, grain, lens distortion, motion blur, vignette;
  - **per-scene profiles** (flight, editor, KSC, tracking) saved in the save game;
  - DX11 only; it conflicts with KS3P.
  - Post cost scales with resolution, not with the scene.
- **Deferred** adds a G-buffer:
  - lighting cost then scales with the pixels each light touches;
  - stencil bits tag parts, terrain, scenery and grass;
  - transparency becomes a **dither or dissolve**;
  - forward-rendered mod shaders lose the benefits;
  - PlanetShine becomes obsolete.
- **Recommendation: built in.**
  - Tonemapping (AgX/ACES), bloom (half-res mip chain, threshold, "fast mode" on low), and auto-exposure for the orbit-to-ground range.
  - Per-scene **post profiles** as plain data (TUFX's useful idea).
  - **Skip deferred.** three's WebGPU path is forward, and our light count is small. Clustered or forward-plus is the answer if engine lights multiply.

## Summary table

| Look | Core technique to adopt | Cheapening trick | `low` → `high` knobs | Built in or mod |
|---|---|---|---|---|
| 1 Re-entry | Silhouette shell + trail + glow, per-body HDR palette | One mesh per part, LOD; flux-driven | Particles 0/on; trail segments; bow shock | **Built in**; palette is mod data |
| 2 Aero/vapour | Same shell, cold palette, Mach-gated cone | No new pass | Off / on | **Built in** |
| 3 Plumes | Mesh + additive/fresnel shaders + controllers | No particles; one light per cluster | Distortion, lights, LOD | **Built-in shaders**; templates are mod data |
| 4 Sky/ocean | Hillaire LUTs; ocean normals → small FFT | LUTs, async readback | FFT 0/64/128 | **Built in**; coefficients are mod data |
| 5 Terrain/rocks | Patches + detail maps; compute-placed instanced rocks | Cell-keyed seeds, instancing, impostors, culling | Density, range, detail | **Built in**; rocks are mod GLBs |
| 6 Clouds | 2D far + raymarched near | ≤ ½ res, 1/4–1/16 temporal, depth-aware upsample, baked shadows | 2D only / ¼ res / ½ res | **Built in**; maps are mod data |
| 7 From orbit | GPU bake cube + night lights + 2D clouds | Bake once, on demand per body | Face 512–2048 | **Built in** |

**Why built in, not mod-provided, for techniques:**
1. KSP 1's mods are mutually fragile renderer hooks (compatibility tables in Deferred, Parallax and TUFX; DX11-only). We have two backends (TSL and GLSL), and a mod shader would have to be written twice and kept in sync with the governor.
2. Cost must be controlled centrally by the frame-budget governor (ADR 0053), which cannot govern foreign passes.
3. KSP 2, the official successor, built every one of these in.

Mods stay valuable as **data**: palettes, templates, maps, coefficients and models, as ADR 0057 already intends.

## Sources (all accessed 2026-10-24)

1. Firefly repo and README — https://github.com/M1rageDev/Firefly
2. Firefly wiki, "Writing body configs" — https://github.com/M1rageDev/Firefly/wiki/Writing-body-configs
3. Firefly wiki, "Useful information" (plasma colours, compositions) — https://github.com/M1rageDev/Firefly/wiki/Useful-information
4. Firefly on SpaceDock — https://spacedock.info/mod/3813/Firefly
5. Firefly forum thread (*snippet*; bow shock, GPU trail, performance) — https://forum.kerbalspaceprogram.com/topic/226818-101-firefly-revamped-atmospheric-effects/page/3
6. KSP 2 modding wiki, "Configuring the reentry effects" — https://modding.kerbal.wiki/Configuring_the_reentry_effects
7. Stock aeroFX keys (*snippet*) — https://forum.kerbalspaceprogram.com/topic/168883-aerodynamic-effects
8. Waterfall repo — https://github.com/post-kerbin-mining-corporation/Waterfall
9. Waterfall wiki, Controllers — https://github.com/post-kerbin-mining-corporation/Waterfall/wiki/Controllers
10. Waterfall wiki, Default Shaders — https://github.com/post-kerbin-mining-corporation/Waterfall/wiki/Default-Shaders
11. Waterfall releases (0.9.0 performance, Additive Volumetric) — https://github.com/post-kerbin-mining-corporation/Waterfall/releases
12. Volumetric plume depth-buffer note (*snippet*) — https://forum.kerbalspaceprogram.com/profile/172107-knight-of-st-john
13. RealPlume repo — https://github.com/KSP-RO/RealPlume ; RealPlume thread (*snippet*) — https://forum.kerbalspaceprogram.com/topic/188033-ksp112x-realplume-stock-v408-realplume-v1332-25jun2021
14. Scatterer wiki, GeneralConfig — https://github-wiki-see.page/m/LGhassen/Scatterer/wiki/GeneralConfig
15. Scatterer wiki, PlanetsConfig — https://github-wiki-see.page/m/LGhassen/Scatterer/wiki/PlanetsConfig
16. Scatterer wiki home — https://github-wiki-see.page/m/LGhassen/Scatterer/wiki
17. Parallax wiki, Global Config — https://github-wiki-see.page/m/Gameslinx/Tessellation/wiki/Global-Config
18. Parallax wiki home — https://github.com/Gameslinx/Tessellation/wiki
19. Parallax Continued repo — https://github.com/Gameslinx/Parallax-Continued
20. Parallax forum thread (*snippet*; compute scatter, CPU subdivision, floating-origin regeneration) — https://forum.kerbalspaceprogram.com/topic/209714-112x-parallax-pbr-terrain-and-surface-objects-208/page/127
21. EVE Redux on SpaceDock — https://spacedock.info/mod/2631/Environmental%20Visual%20Enhancements%20Redux
22. EVE forum (2D plus volumetric fade, `visibleRange`; *snippet*) — https://forum.kerbalspaceprogram.com/topic/149733-18-environmentalvisualenhancements-180-2/page/18
23. blackrack, True volumetric clouds release 3 (*snippet*; 403) — https://www.patreon.com/posts/87982960
24. blackrack, release 5 (*snippet*; 403) — https://www.patreon.com/posts/139879553
25. KSP 2 Developer Insights #22 "Sky's the Limit" (*snippet*; 404 on fetch) — https://kerbalspaceprogram.com/news/developer-insights-22-skys-the-limit ; forum copy — https://forum.kerbalspaceprogram.com/topic/221145-developer-insights-22-skys-the-limit
26. KSP 2 0.1.5.0 notes (cloud dynamic resolution, shadows) — https://kerbal.wiki/0.1.5.0
27. KSP 2 Developer Insights #12 "Planet Tech" (*snippet*) — https://forum.kerbalspaceprogram.com/topic/205930-developer-insights-12-%E2%80%93-planet-tech
28. KSP 2 Developer Insights #18 (*snippet*) — https://forum.kerbalspaceprogram.com/topic/214806-developer-insights-18-graphics-of-early-access-ksp2
29. TUFX repo — https://github.com/KSPModStewards/TUFX
30. Deferred repo — https://github.com/LGhassen/Deferred
31. Kopernicus OnDemand (*snippet*, 2018) — https://forum.kerbalspaceprogram.com/topic/181547-181-1-please-fork-me-kopernicus-kittopiatech ; RSS-Textures — https://github.com/KSP-RO/RSS-Textures
32. SpaceEngine blog (0.990 terrain, Bruneton atmosphere; *snippet*) — https://spaceengine.org/ru/news/blog190611/
33. MSFS 2024 cloud artefacts (forum, anecdotal) — https://forums.flightsimulator.com/t/glowing-aircraft-and-objects-outline-around-aircraft-or-objects/366571?page=7 ; https://forums.flightsimulator.com/t/best-method-to-reduce-pixelated-clouds-in-msfs-2024/753807
34. Cloud reprojection background (¼ res, 1/16 steps) — https://ar5iv.labs.arxiv.org/html/1609.05344
35. Unity Post-Processing v2 (Bloom fast mode, AO) — https://docs.unity3d.com/Packages/com.unity.postprocessing@3.0/manual/toc.html

**Not reached:** the Lindner re-entry paper; Waterfall's shader parameter docs (placeholder page); blackrack's Patreon technical posts (403); the full text of the KSP 2 dev diaries (404); any Asobo or MSFS technical talk on clouds.
