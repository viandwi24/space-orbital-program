# Graphics and performance v2: 120 fps, better looks, and mods that supply visual data

Written 2026-10-24 by the coordinator (owner's CTO mandate), from the owner's request and four research notes in this folder.

## The owner's targets

- On the MacBook Pro M5 at Retina, a **stable 100–150 fps**. In practice that means a **locked 120** on its 120 Hz display.
- **Better visuals**, matching the seven reference looks in `reference/`:
  1. re-entry heat in several colours;
  2. aero and condensation effects;
  3. engine plumes;
  4. ocean and atmospheric scattering;
  5. terrain detail;
  6. volumetric weather;
  7. planets seen from orbit.
- **Better textures** for Home's land, the view from above, the Moon and the other bodies.
- **Mods can add planets with textures, parts with 3D models and textures, and change the look.** Today a mod is a JSON package. 3D models are already supported (glTF); textures for planets and visual changes are not.
- **Fix two physics bugs:** opening bays and covers in space flings the rocket, and collisions sometimes miss (between parts, and between a vessel and the ground).
- **Scale of the work:** at most three workers, watching CPU and RAM. No e2e; a quick visual look in a browser is allowed for graphics changes.

## The research

| Note | What it answers |
|---|---|
| [01 KSP and its mods](01-ksp-and-mods.md) | How Firefly, Waterfall, Scatterer, Parallax, EVE and blackrack's clouds, Kopernicus, TUFX and KSP 2 achieve each look, what each costs, and their quality knobs |
| [02 Browser 120 fps](02-browser-120fps.md) | Frame pacing at 120 Hz, WebGPU and Apple GPU practice, TAAU, temporal clouds, GPU terrain; ranked list of 10 changes |
| [03 Our renderer and mods today](03-renderer-and-mod-audit.md) | Our passes and their costs on the M5, which effects exist, player settings, what a mod can supply today, and the gaps |
| [04 Physics: fling and missed collisions](04-physics-fling-and-collision.md) | Root causes with file:line evidence, and tests for each fix |

## Where we stand (from 03)

- **Frame time, Retina `high` on the M5:**
  - WebGL: about 15–17 ms on the ground and 10 ms in orbit.
  - WebGPU: 18–21 ms of GPU time.
  - With the governor on, about 57 fps.
- **Where the time goes:** pixels are about 70 % of the frame. The rest is the frame end (resolve and present), shadows redrawn every frame, and about 350 draw calls.
- **What already exists:**
  - re-entry blackbody glow and a plasma shell;
  - plumes built from cones and a sprite;
  - a sea of analytic waves;
  - a Hillaire LUT sky;
  - a cumulus slab and cirrus clouds;
  - a terrain height-field march.
- **What is missing:**
  - condensation;
  - sky reflection on the sea;
  - weather;
  - volumetric clouds up close;
  - terrain normal maps and rocks away from the site;
  - image textures from orbit;
  - any visual hook for mods.

## Decisions (ADR 0330)

1. **A locked 120 on Chrome and Edge is the target.** On Safari the target is a locked 60, because Safari caps ProMotion near 60. The budget is ≤ 7 ms of GPU time and ≤ 4–6 ms of main-thread time per frame. A frame that misses its slot shows for two refreshes, so averages do not count; the measure is the p95 frame interval.
2. **Pixels are the lever.**
   - The 3D image renders at about 0.6 of the side and is rebuilt with TAAU (temporal anti-aliased upscaling). This replaces MSAA and the planet pass's bilinear upsample.
   - FSR 1 covers camera cuts and the WebGL2 path.
   - The governor's fast axis becomes the TAAU input scale (0.5–0.75). Changing it needs no new pipelines.
3. **Every look is built in. Mods supply data, not shaders.**
   - KSP 1's visual mods replace parts of the renderer and break each other; KSP 2 built the same techniques in. We follow KSP 2.
   - The engine owns the techniques: plasma shell and palettes, condensation, plume templates and controllers, sky and ocean, clouds and weather, terrain detail and rocks, orbital textures, post-processing profiles.
   - Each look has a **quality setting and an on/off switch** in Settings, and an *Ultra* preset uses what the savings free up.
   - Mods supply **data** for these looks:
     - per-body plasma palettes;
     - plume templates per engine;
     - cloud and weather maps;
     - ocean and sky coefficients;
     - post-processing profiles;
     - planet albedo, height and normal maps (the height map also feeds the sim's terrain, so collision matches what is drawn);
     - glTF parts and buildings.
   - Shader-level hooks for trusted mods are **deferred**. Every pipeline must be compiled and warmed at load (ADR 0308/0310), and untrusted shader code cannot be checked.
4. **Physics fixes come first.** They break flights today, the fixes are small, and the measurements need stable scenes.

## Plans

Order of work: physics, then performance, then looks, then mod data and content. One worker owns the renderer core, so passes do not collide.

| Plan | Title | Size | Worker |
|---|---|---|---|
| 390 | Separation and deploy without flinging: contact pairs ignored after a split, panels spawned clear, hollow bays, gradual collider changes, robotics momentum (absorbs 281) | L | B |
| 391 | Collisions that never miss: wake rails vessels near flight, CCD for thin and fast parts, merged physics frames, ground collider from the real terrain, docking angular momentum | L | B |
| 392 | 120 Hz measurement: Chrome at 120 Hz, an Xcode Metal capture of the frame end, the main-thread split with Long Animation Frames, a new baseline (absorbs 368's measurement step) | M | A |
| 393 | TAAU: the 3D image at about 0.6 of the side, rebuilt temporally; MSAA off; FSR 1 on cuts and on WebGL2 | L | A |
| 394 | Apple tile-GPU hygiene: store and discard actions, transient attachments, one merged final pass, bloom from ¼ size, `rg11b10ufloat` targets (absorbs 368) | M | A |
| 395 | A governor for 120 Hz: a 7 ms budget, a lock at 120 or 60, the TAAU scale as the fast axis, 120 in the frame-rate setting | M | A |
| 396 | CPU at 120 Hz: HUD updates at 30–60 Hz with no per-frame allocation, `BundleGroup` for the static site, Long Animation Frames in Debug | M | C |
| 397 | Clouds v2: temporal cloud marching on TAAU's history, compute-baked 3D noise, a weather coverage map that changes over time, volumetric clouds near the vessel | XL | A |
| 398 | GPU terrain near the surface: a compute CDLOD quadtree with indirect draws below about 20 km, real silhouettes, detail normal maps (ADR first) | XL | A |
| 399 | Re-entry and aero v2: per-body plasma palettes (Firefly style), condensation and vapour cones gated by Mach | M | C |
| 400 | Engine plumes v2: Waterfall-style templates (mesh, material, controllers), templates per engine, one light per cluster | L | C |
| 401 | Ocean v2: sky reflection from the LUT, scrolled detail normal maps, then a 64² FFT in WebGPU compute at `high` | L | C |
| 402 | Terrain detail: rocks and scatter placed by compute in body-fixed cells and drawn instanced, LODs and impostors; triplanar detail textures | L | B |
| 403 | Planets from orbit: higher-resolution bakes, night lights, a 2D cloud cube at orbit distance, per-body texture streaming in KTX2 | L | B |
| 404 | Graphics settings v2: switches and quality for each look, an *Ultra* preset, a resolution-scale slider, the 120 fps option | M | C |
| 405 | Mod visual data: plasma palettes, plume templates, cloud and weather maps, sky and ocean coefficients, post profiles, larger caps, KTX2 and WebP, and the guide | L | B |
| 406 | Planet mods: albedo, height and normal maps for a mod body; the height map feeds the sim terrain; non-Home bodies get sky, sea and clouds in the planet pass | L | B |

Drafts folded in:
- **368** moves into 392 and 394.
- **367** (batched parts) and **369** (cached site shadows) stay, and run after 396.
- **342**, **365** and **374** stay as they are.

## Acceptance for the whole wave

- **M5 Retina, Chrome, `high`, governor on:** p95 frame interval ≤ 8.4 ms at the pad, 3 km, 12 km and in orbit, with fewer than 1 % of frames over 16.7 ms in a 2-minute flight.
- **Looks:** all seven reference looks exist, each with a quality setting and a switch. The owner judges them by hand.
- **Mods:** a mod can add a textured planet that the sim collides with, and per-body plasma, cloud and plume data.
- **Physics:** no fling on opening bays, doors, legs or petals in space. A vessel cannot pass through another vessel or the ground. Each fix has a unit test.
