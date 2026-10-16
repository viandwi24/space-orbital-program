# 019 — Visual: flight environment

**Plan:** plans/019-flight-environment.md · **Session:** environment session (Claude, 2026-10-16) · **Date:** 2026-10-16 · **ADR:** [0027](../decisions/0027-environment-rendering-pipeline.md)

## What was done

The draft was refined to `ready` at the human's request (three.js docs checked, ADR 0027, measurable criteria; `docs/research/three.md`), then implemented in `packages/renderer` with a three-hunk wiring in `apps/web/src/lib/flight-loop.ts` and a new `apps/web/src/lib/graphics.ts`.

| Module (`packages/renderer/src`) | What it is |
|---|---|
| `sun.ts`, `exposure.ts`, `atmosphere-model.ts`, `presets.ts` | Pure maths: fixed star direction + body rotation, eye adaptation, a TypeScript twin of the scattering shader (sun/ambient/fog colours), preset table + `selectPreset`/`parsePreset` |
| `noise.ts`, `planet-map.ts` | Seeded noise and the generated biome map (1024 x 512 RGBA8; continents, moisture, temperature, rock; the launch site is forced to grass) |
| `site.ts`, `site-meshes.ts` | Launch-site layout (pure, seeded) and its meshes: tower with swing arms, masts, tanks, hangar, offices, light poles, radar, windsock, instanced trees/rocks |
| `planet-frame.ts`, `planet.ts`, `shaders/*` | The planet pass: exact sphere, Rayleigh + Mie march, biome ground + ocean, clouds + shadows, stars, sun disc, log-depth write; float64 camera frame with a 1024 m anchor |
| `environment.ts`, `shadow-fit.ts` | Sun `DirectionalLight` (colour from the atmosphere), sky ambient, fog, exposure, shadow box that follows the vessel (texel-snapped) |
| `environment-light.ts`, `post.ts`, `renderer.ts` | PMREM image-based light from a procedural sky, bloom + ACES + sRGB chain, facade with `setPreset` and `debug` |
| `camera-presets.ts` | Named sun/camera presets for the pad screenshots |

`apps/web`: `lib/graphics.ts` (saved preset, capability probe, `resolvePreset`), `flight-loop.ts` (`createRenderer({ preset, atmosphere })`, `Flight.setGraphicsPreset`, `__orbital.renderer()` in dev).

## Manual run (acceptance criteria `[manual]`)

Built-in browser (Chromium in the Claude desktop app, Apple M5), own Vite server on port 5181 with a temporary config that ignored other sessions' routes (deleted). The pane was hidden while I worked, so `requestAnimationFrame` did not run: the capture hook calls `renderer.update(snapshot)` and `renderer.render()` itself and POSTs `canvas.toDataURL()` to a throwaway Bun receiver (killed). Shots are 2048 x 1536 (device pixel ratio 2, preset `high`), HUD not included.

| Screenshot (`docs/journal/assets/`) | How it was taken |
|---|---|
| `019-pad-noon.png`, `019-pad-low-sun.png`, `019-pad-morning.png`, `019-pad-close.png` | the real sim, vessel on the pad; `Renderer.debug` fixes the sun (62 degrees / 6 degrees; morning = the real sun at about 30 degrees) and the camera (presets in `camera-presets.ts`) |
| `019-ascent-20km.png` | real sim, dev autopilot (`P`), captured when the vessel passed 20 km |
| `019-orbit-day-rim.png`, `019-orbit-day-close.png`, `019-orbit-terminator.png` | real sim, same autopilot run, in orbit; time warp 50 to 100 to move over day side and terminator |
| `019-orbit-night.png` | the same real orbit on the night side (sun 33 degrees below the vessel's horizon), exposure adapted over 250 frames |
| `019-map-view.png` | **synthetic snapshot** (a copy of a real snapshot with the vessel moved to 150 km and an invented elliptic `orbit`), map view; shows the orbit line, the marker and the planet occluding the line |

The pad night shot used for debugging is not kept. Orbit shots after the fact: the vessel mesh is the placeholder cylinder stack (plan 020).

## Frame times (1920 x 1080, device pixel ratio forced to 1)

Machine: Apple M5 (10-core GPU), 16 GB, Chromium (Claude desktop browser pane). `Renderer.debug.benchmark(n)` renders n frames back to back and reads one pixel at the end ("thr" = ms per frame when frames are pipelined). "sync" = one frame at a time with a pixel readback each (about what a frame costs from submit to done). 150 frames after 30 warm-up, two repeats.

| Scene | low thr / sync | medium thr / sync | high thr / sync |
|---|---|---|---|
| pad (real sun) | 4.1 / 5.7 | 8.2 / 11.0 | 9.9 / 13.1 |
| 20 km ascent | 3.1 / 4.3 | 6.1 / 9.0 | 7.8 / 11.5 |
| 100 km orbit, planet and clouds | 3.4 / 5.2 | 6.8 / 10.7 | 8.2 / 14.6 |

`high` stays under 16.7 ms even in the "sync" metric on this machine. The budget (ADR 0025) is an M1/M2: not measured, an M5 is considerably faster, so `selectPreset` gives Apple M1/M2 `medium` and M3 and later `high` until someone measures. Sources of cost: the planet shader (sky ray march 16 x 6 samples, 13 noise octaves, cloud shell, ground shadow lookup) and the 4096 shadow map; `low` renders directly to the canvas (4x MSAA canvas, no bloom, no shadow map). An earlier run with `medium` at 2x MSAA was slower than `high` (7.6 vs 3.3 ms thr); Metal's 2x path on a half-float target is odd, so `medium` uses 4x like `high`.

## Surprises (read these before touching the renderer)

- **`projectionMatrixInverse` with `far = 1e13` divides by zero at NDC z = 1.** Ray reconstruction must use z = 0. The first black screen was this.
- **three's empty shadow texture is never uploaded**; a `sampler2DShadow` with nothing bound makes WebGL skip the draw ("Mismatch between texture format and sampler type"). The planet pass binds its own 1 x 1 compare-enabled depth texture when there is no shadow map.
- **NaNs in the planet pass wreck the whole frame in the post chain** (bloom smears one NaN or Inf over the screen: a completely white frame). Culprits found: `pow(negative, 2.0)` in the star band, `pow(0.0, 0.0)` for the first march sample, `normalize(0)` in the bump normal. The shader now ends with a NaN/Inf guard; build with `defines.DEBUG_NAN = 1` to see offending pixels in magenta.
- **The hidden Browser pane does not run `requestAnimationFrame`**; and Vite reloads the page whenever *anything* imported changes (including the other session's `apps/web/src/lib` files), which restarts the flight. Screenshots are therefore driven from the console and a synthetic snapshot can stand in for a position the sim would need minutes to reach (`window.__fake` in my scratch tools; used only for debugging and the map view).
- **The sim places a vessel at an inertial latitude/longitude at load time.** The body has been turning for about 1 s by then, so the vessel stands about 160 m from body-fixed (0, 0). The first version of the site was in the wrong place. The renderer now defines the launch site from the first vessel near the ground (ADR 0027 item 11). A proper fix belongs in the sim (draft plan 025).
- Value noise in float32 at 600 km magnitudes would swim: all fine ground detail is computed relative to a 1024 m body-fixed anchor with integer lattice offsets (`noiseA` in the shader, `planet-frame.ts`); the camera is also lifted to 1.2 m above the sphere so it never goes underground.
- `Renderer.debug.benchmark` exposed that 2x MSAA is slow on this GPU (see above).
- The orbit camera in map view clamped its "unset" distance of 0 to 1 m on the first drag (pre-existing, plan 008); fixed with a test.

## Test output

```
bun test packages/renderer      64 pass, 0 fail
bun test                        509 pass, 0 fail (66 files)
bun run --filter @orbital/web test   141 pass (20 files)
bun run typecheck / build / docs:check   green
```

Mutation checks (made the test fail once, then restored): `SUN_LONGITUDE` pi/3 to pi/2 (sun test fails), shadow snapping removed (4 shadow-fit tests fail), planet-map site clearing shrunk (grass-at-site test fails).

## Self-review against `product/visual-direction.md`

Question asked: would a player who knows KSP/KSP2 take these screenshots seriously? Honest answers per bullet.

| Direction | Verdict |
|---|---|
| Sky with atmosphere: blue by day, warm horizon at low sun, black with altitude, sun glare, stars | Met. Day gradient, orange horizon at 6 degrees with a bloomed sun, fade to black over the ascent, stars at night and above the atmosphere. The low-sun sky is a little olive/grey in the middle (single scattering, no ozone term); not yet KSP2 golden-hour drama. |
| Planet that reads as a planet: varied ground, detail near the pad, curvature and rim, terminator | Met from orbit (rim, clouds, ocean, terminator with warm twilight). Ground is still flat: no heights, no mountains, no rivers; biome variety is colour only, so from 20 to 100 km the land looks like a painted map and the coast has a noisy sand outline. Near the pad the lawn is fine but is noise colour, not grass: no blades, no tufts, no wind. |
| A launch site that gives scale | Met in structure (pad with scorch and markings, tower with swing arms, masts, tanks, hangar, roads, trees, props). It is all box-and-cylinder CSG: no weathering, windows are a texture, the hangar is a plain slab. A KSP2 player will see "generic". It is honest placeholder art made in code. |
| Lighting: one sun with shadows near the vessel, PBR, tone mapping, bloom | Met: PCF shadows from tower and vessel onto the pad and ground, ACES, bloom on the sun and lamps, IBL from the sky. Weak spot: the vessel is the plan-008 grey cylinder stack, so the hero of every screenshot still looks like a debug object (plan 020). Env reflections give streaky highlights on the cylinder. |
| Clouds and haze so distance reads | Partly: a cloud shell (soft edges, detail noise, ground shadows) and aerial perspective in the shader, fog on props. No volumetrics, no cloud parallax from the pad other than the sky layer; the horizon from the pad is clean, there is little haze. |
| Release readiness | Not there yet: the vessel, plume and smoke (020), the HUD (021, other session), terrain heights, M1/M2 frame times unmeasured, no mobile path. The environment alone would not be torn apart in a screenshot of the pad or of orbit; the ascent screenshot with the placeholder rocket still would. |

What still looks like a debug view: the vessel; the ground between 1 km and 20 km (flat painted lawn); the coast outline; the map-view marker (plan 021 territory). What is surprisingly good: the 100 km day-side rim, the terminator, the low-sun glare at the pad.

## For plan 020 (part meshes and effects, same renderer)

- Lights: one `DirectionalLight` named `sun` (colour = atmosphere transmittance at the camera, intensity 12 = sun irradiance, physical lights), a `HemisphereLight` `sky` that is hidden once the PMREM environment exists, `scene.environment` = prefiltered procedural sky (refreshed when `Environment.state.envKey` changes). Use `MeshStandardMaterial`/`MeshPhysicalMaterial`; set `castShadow`/`receiveShadow` on part meshes (the shadow box already follows the vessel; `SceneModel.vesselRadius` is the bounding radius from part offsets + 2 m).
- Tone mapping/exposure live in the output pass; custom shaders must write linear HDR and include `<tonemapping_fragment>` and `<colorspace_fragment>` (they are no-ops inside the chain). Emissive/plume values above the bloom threshold (3.0 in linear HDR, before exposure) bloom.
- Log depth: any custom `ShaderMaterial` must include the `logdepthbuf` chunks (vertex and fragment) like three's own materials.
- Material/mesh providers: `PartShape` is still the placeholder interface (ADR 0012); `SceneModel.partMaterial` is one shared `MeshStandardMaterial`. Swapping in per-part meshes means replacing `geometryFor` and `partMaterial` in `scene.ts`.
- Headroom (M5, 1080p, `high`, sync metric): 14.6 ms worst case here; keep part meshes and effects within a couple of milliseconds, or lower the planet pass cost first (16 view samples, 13 octaves) via the preset table.
- Effects that depend on ambient pressure can read `Environment.state.altitude`; sun elevation at the camera is `Environment.state.sunElevationDeg`.

## For the HUD/settings side (plans 021, 023)

- `Flight.setGraphicsPreset(preset)` saves (`orbital.graphics`) and applies a preset at once; `apps/web/src/lib/graphics.ts` has `loadGraphicsPreset`, `saveGraphicsPreset`, `probeCapabilities`, `resolvePreset`. Valid values: `GRAPHICS_PRESETS` from `@orbital/renderer`.
- Switching recompiles shaders and rebuilds the post chain and trees: expect a hitch of tens of ms; do it from a settings control, not per frame.
- `Renderer.debug` is meant for dev builds only (`window.__orbital.renderer()` is exposed under `import.meta.env.DEV`).

## Not done / follow-ups

Draft plan 025 collects: terrain heights and LOD, ground vegetation, ocean waves and foam, volumetric or layered clouds, cirrus and haze, sim fix for the launch-site coordinates (place at body-fixed coordinates, or put the site in the snapshot), M1/M2 measurements and default presets, a shader compile spinner, mobile.
