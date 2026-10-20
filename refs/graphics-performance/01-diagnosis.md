# 01 — Diagnosis: our frame, pass by pass

Read-only audit of `packages/renderer/src` (three.js r186 `WebGLRenderer`, custom GLSL) on 2026-10-19. Line numbers are as of `main` that day. Anything marked *(inferred)* is reasoning, not a measurement.

## 1. The frame

`drawFrame` is at `renderer.ts:257-277`. The renderer is created with `antialias: true` and `logarithmicDepthBuffer: true`, ACES tone mapping and `PCFShadowMap` (`renderer.ts:213-221`). The pixel ratio is `min(devicePixelRatio, pixelRatioCap) × renderScale` (`renderer.ts:234-239`). `high` is at `presets.ts:132-162`.

| # | Pass | Resolution | Work per pixel at low / medium / high | Reused across frames? |
|---|---|---|---|---|
| 1 | Cloud-map bake (`cloud-field.glsl.ts`) | 2048×1024 | 3-octave fbm | **Baked**; drift by rotation at lookup |
| 2 | Terrain cube bake (6 half-float faces) and two camera patches (4 km, 33 km) | 512 / 768 / 1024; patches 512 / 512 / 1024 | – | **Baked**; patches re-baked when the camera leaves the core (8.0 ms on `high`, journal 068) |
| 3 | Terrain march prepass (`march.glsl.ts`) | 1/4 of each side | 48 / 80 / **128** steps | every frame |
| 4 | **Planet pass**: one fullscreen triangle, all of sky, terrain, ground, sea, clouds, shafts, aurora and stars (`planet.glsl.ts:1191-1590`) | full scene target, inside 4× MSAA | rows 4a–4h | **every frame, every pixel** |
| 4a | terrain refine march + root finding | | 24 / 32 / **40** steps, 1–3 height fetches each | every frame |
| 4b | atmosphere single scattering (`atmosphere.glsl.ts:126-179`) | | 8 / 12 / **12** samples, each a sun-depth fetch and `exp` | every frame |
| 4c | light shafts (second march, sunward pixels) | | 0 / 4 / **8** samples, each with **4** terrain-cube fetches on `high` | every frame |
| 4d | cumulus slab march | | coverage fbm 3 / 3 / **4** octaves; then 3 / 4 / **6** steps × erosion 1 / 2 / **3** octaves + a sun probe | every frame |
| 4e | cirrus | | 1 noise + 2 two-octave fbm | every frame |
| 4f | ground surface | | 8 / 9 / **11** value-noise octaves, biome map, waves, rivers | every frame |
| 4g | ground light | | 3×3 PCF shadow; terrain shadow 0 / 5 / **8** steps; cloud shadow: none / baked map / **4-octave noise** | every frame |
| 4h | aurora (own program when in reach) | | 0 / 8 / 12 steps | every frame |
| 5 | Half planet pass + upsample + edge pass (governor rung only, ADR 0064/0087) | half side | as 4 | rung only |
| 6 | Shadow map, one directional map, no cascades | 0 / 2048 / **4096** | casters within 170 m and the vessel | every frame while the sun is up |
| 7 | IBL capture (PMREM) | 128 | 8 samples | **Cached**; recaptured every 2° of sun or ~41 % altitude change (5–6 ms each, journal 048) |
| 8 | Meshes: site, 2000 trees, 28000 tufts, parts, particles | full, 4× MSAA | three.js materials, all writing `gl_FragDepth` (log depth) | every frame |
| 9 | Bloom (`UnrealBloomPass`) | ¼ side down to 1/64; the blend back at full size into the MSAA target | | every frame |
| 10 | Output (tone map, sRGB) | full | | every frame |

Render targets *(read from the code)*:
- The scene target is RGBA16F with `samples: msaa`. `EffectComposer` clones it, so the ping-pong buffer is also 4× MSAA.
- The canvas itself is multisampled (`antialias: true`) although it only receives the output quad *(inferred: wasted)*.

## 2. Baked versus per pixel per frame

**Baked or cached:**
- the transmittance ("sun-depth") table, 128×64, built on the CPU;
- the biome map;
- the terrain cube and patches;
- the cloud map (ADR 0070/0086);
- the PMREM cube;
- the smoke noise texture (ADR 0088).

**Per pixel per frame:**
- every noise: hashed value noise, `pcg3d`, 8 hashes per `noiseF`;
- every march: terrain refine, atmosphere, shafts, clouds, terrain shadow.

A cumulus pixel on `high` is roughly 250 hashes, a ground pixel roughly 130 *(inferred count)*.

The sky has **no** sky-view, aerial-perspective or multi-scattering LUT. ADR 0027 rejected Bruneton LUTs, and every pixel marches 12 samples.

There is **no temporal technique anywhere**: no history buffer, no reprojection, no frame index in the jitter. ADR 0064, ADR 0087 and journal 037 all defer a history buffer to after v1.

## 3. Costs already recorded (Apple M5, 1920×1080, ratio 1, `high`, sync ms)

| Source | Finding |
|---|---|
| Journal 039 | pad 14.4, 3 km 10.8, 12 km 7.9, orbit 6.9, hillside 13.0–13.7. **At ratio 2 on a 1080p canvas (8.3 Mpx), hillside: 47.5 ms**; at scale 0.85 34.8; at 0.7 24.1 |
| Journal 050 / ADR 0064 | The half planet pass: pad 15.45 → 8.85, hillside 14.0 → 6.3. The planet pass is 9–12.5 of 13–14 ms; post (resolve, bloom, output) about 2 ms |
| Journal 037 | Cumulus up to 7 ms in cloudy views |
| Journal 054 / 062 | Shafts +0.5 to +2.4 ms; terrain-cast shafts +0.5 / +0.9 |
| Journal 050 / ADR 0086 | Cloud shadow from noise +1.0–1.2 ms; from the baked map about +0.1 |
| Journal 061 | Aurora +3.0 ms |
| Journal 056 / ADR 0087 | Edge pass +1.0–1.5 ms |
| Journal 048 | 4096 shadow map allocation 30–36 ms (one-off); PMREM capture 5–6 ms (repeating during ascent) |
| Journal 066 (M2 13", 1080p) | `high` pad 40.25, `medium` 33.0, `low` 21.6; the M2 is about 3× slower than the M5 |
| ADR 0053 | Budgets: `high` ≤ 16.7 ms, `medium` ≤ 13.3 ms, **on the M5 at 1080p**. No Retina budget exists |

**Estimate for the M5 at Retina** *(inferred)*:
- The per-pixel part, about 9–12.5 ms at 1080p, times 2.85 for the extra pixels, comes to about 26–36 ms. The rest adds 2–4 ms.
- So `high` at Retina should take **30–40 ms**. That agrees with the 47.5 ms measured at 8.3 Mpx.

## 4. The quality governor

`quality-governor.ts` holds the ladder and its rules:
- **Ladder** (`:29-56`), per preset: scale 1, 0.85, half planet, half planet at 0.7.
- **Budget:** 1000/55 = 18.2 ms. It smooths over 0.5 s and steps down after 3 s over budget.
- **Retries:** it tries a step up after 20 s of calm, and each failure doubles the wait, up to 160 s.

What it measures, and what it cannot see:
- It sees only the requestAnimationFrame interval (`apps/web/src/lib/flight-loop.ts:698-707`). `EXT_disjoint_timer_query` is not used: it read nonsense in a hidden pane (ADR 0053) and is missing in Safari ([04](04-techniques.md) §8).
- `selectPreset` gives any M3 or later `high` whatever its pixel ratio (`presets.ts:182-196`).

Consequences at Retina `high` *(inferred)*:
- It settles on the half rung, at about 10–14 ms on the M5.
- Every retry brings back about 3 s of 30–40 ms frames, then steps down again.
- Release plan 201 already targets the oscillation ("at most one preset change in 30 s" under a trace around 55 fps). This research gives that plan its cause.
- On a 120 Hz display it aims only at 55 fps.
- It cannot tell a GPU-bound frame from a CPU-bound one.

## 5. Top cost drivers at `high`, Retina (ranked)

1. **Pixel count from pixel ratio 2**: ×2.8 on nearly everything.
2. **Cumulus slab and its noise**: up to 7 ms at 1080p, about 20 ms at Retina *(inferred)*.
3. **Atmosphere and shafts marched per pixel**: 12 + 8 samples, and shafts read 4 terrain fetches per sample on `high`.
4. **Cloud shadow from 4-octave noise on ground pixels**: `high` only; `medium` uses the baked map.
5. **Bandwidth**:
   - a 4× MSAA RGBA16F scene target, plus a cloned 4× ping-pong buffer, plus the bloom blend back into MSAA, plus a multisampled canvas;
   - log depth makes every mesh write `gl_FragDepth`, which defeats early depth rejection and Apple's hidden-surface removal *(inferred; not measured)*.
6. **Terrain refine march**: 40 steps; 3.5 ms at the hillside at 1080p.
7. **4096 shadow map** re-rendered every frame.
8. **Governor retries and PMREM recaptures**: periodic spikes rather than average cost.

Side finding: comments in `half-res.ts:2`, `quality-governor.ts:16` and `renderer.ts:191` cite "ADR 0061" for the half-resolution pass. That ADR is 0064; 0061 is about remappable keys.
