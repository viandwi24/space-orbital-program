# 020 — Visual: part models, materials and effects

**Plan:** plans/020-part-models-and-effects.md · **Session:** parts session (Claude, 2026-10-16) · **Date:** 2026-10-16 · **ADR:** [0028](../decisions/0028-part-visuals-and-model-providers.md)

## What was done

The draft was refined to `ready` at the human's request (three.js docs checked in `docs/research/three.md`, ADR 0028, measurable criteria; Log line in the plan), then implemented. Core, SDK, stock and renderer changed; `apps/web` got one two-line wiring change in `flight-loop.ts` (`partVisuals`, `partAttach` into `createRenderer`).

| Where | What |
|---|---|
| `packages/core` (`schemas.ts`, `definitions.ts`, `version.ts`), `packages/sdk` | `partVisualSchema`, `PartDefinition.visual`, `PartVisual` type; `API_VERSION` 0.1.5 to 0.1.6 (additive, ADR 0028) |
| `mods/stock/src/parts.ts` | every stock part has a `visual` (kinds, palettes, engine plume mount, leg deploy and stance); `LEG_*` constants pinned to the module defaults by a test |
| `renderer/src/parts/` | `revolve.ts` (surface of revolution with hard edges), `builder.ts` (merge per material slot, groups), `generators/*` (capsule, tank, engine, decoupler, reaction wheel, landing legs, heat shield, plain), `textures.ts` + `materials.ts` (procedural `DataTexture`s, PBR slots), `factory.ts` (`PartModelFactory`, `ProceduralProvider`, `ShapeProvider`), `types.ts` (`PartModel`, `PartModelProvider`), `registry.ts` (generator registry by `kind`) |
| `renderer/src/effects/` | pure maths: `plume.ts`, `glow.ts`, `reentry.ts`, `particles.ts`, `explosion.ts`, `transitions.ts`; three objects: `plume-mesh.ts`, `plasma-mesh.ts`, `field.ts` (instanced billboards), `system.ts` (the driver), `shaders.ts` |
| `renderer/src/scene.ts`, `renderer.ts`, `presets.ts` | per-part models instead of grey meshes, effects wiring, `setPreset` rebuilds part detail, new preset knobs (`partSegments`, `partExtras`, `partTexture`, `smokeParticles`, `debrisShards`), the camera holds a destroyed vessel's place for 5 s, `Renderer.debug.{setPartTemperature, focusPart, stepEffects}` |

Parts (triangles per preset, low / medium / high): command pod 1208 / 1860 / 2132, reaction wheel 384 / 684 / 972, small tank 480 / 960 / 1416, medium tank 480 / 1248 / 1800, engine 1432 / 2952 / 4160, decoupler 320 / 672 / 1024, landing legs (all four out) 736 / 1008 / 1280, heat shield 384 / 960 / 1536. The two-stage vessel used for the screenshots (seven parts) is 5 736 triangles on `low` and 15 664 on `high`.

Design points worth knowing:

- **No renderer table of stock ids.** Stock gets its look from `visual` on the part definition, like any mod (ADR 0028). The provider chain is the seam for assets later.
- **Models are built from the snapshot only**: engine plume from `PartSnapshot.modules[plume.module]` (`ignited`, `throttle`, `flameout`) and the ambient pressure at the nozzle (computed from the body's atmosphere and the part's altitude); glow from `PartSnapshot.temperature`; leg deployment from `modules['stock.landing-leg'].deployed`.
- **Explosions, burn-up and separation puffs are inferred from two snapshots** (`transitions.ts`): a part that vanished while moving fast relative to the ground (impact), or hot (burn-up), or a vessel that split. The ground speed uses the body's angular velocity estimated from successive `BodySnapshot.rotation` values, because a vessel at rest on the equator moves at 174 m/s inertially. Resting debris that despawns makes no explosion.
- **Smoke, dust and gas live in body-fixed coordinates** (a seeded pool), so they stay on the ground while the planet turns; written to render space each frame.

## Manual run (acceptance criteria `[manual]`)

Built-in browser (Chromium in the Claude desktop app, Apple M5), own Vite server on port 5183 with a temporary config that ignored `apps/web/src` (the HUD session's files; deleted with the launch entry), design set through `localStorage['orbital.design']` (two-stage vessel: pod, wheel, small tank, engine, decoupler, medium tank, engine; a lander: pod, wheel, tank, legs; a capsule with a heat shield). Captures: `r.render()` then `canvas.toDataURL()` POSTed to a throwaway Bun receiver (killed), canvas forced to 1920 x 1080 at device pixel ratio 1, preset `high`, HUD not included.

| Screenshot (`docs/journal/assets/`) | How it was taken |
|---|---|
| `020-pad-close.png`, `020-pad-medium.png`, `020-engine-close.png` | real sim, vessel on the pad, `Renderer.debug` sun/camera/`focusPart` |
| `020-liftoff.png` | real sim: throttle 1 and stage, 1.7 s after the engine lit |
| `020-staging.png` | real sim: second `stage` command at about 60 m, 0.25 s later (decoupler fired, upper engine lit, gas puff and flash) |
| `020-plume-air.png`, `020-vacuum-plume.png` | **synthetic snapshot**: the live snapshot with the vessel moved to 300 m / 150 km altitude and the lower engine forced to `ignited`, same camera, so the plume width at sea level and in vacuum can be compared |
| `020-reentry-glow.png` | **synthetic snapshot**: a capsule stack with a heat shield at 46 km, 6 800 m/s relative to the air, per-part temperatures (shield 1 900 K, tank 1 050 K, wheel 800 K, pod 700 K) invented; plasma intensity comes from the real `plasmaIntensity` |
| `020-explosion.png` | **synthetic snapshot pair**: the vessel falls at 60 m/s and 4 of its 7 parts vanish at 0.2 m altitude; the transition detector produced the event, `stepEffects` advanced 0.95 s |
| `020-legs-deployed.png` | real sim: lander design, `stage` command deployed the legs (the animation took 1.2 s) |

A real crash was not captured: after the vessel is destroyed the old camera went to the planet centre (no active vessel), which hid the explosion; the camera now holds the wreck's place for 5 s (`SceneModel.ghostVessel`, unit-tested) and the explosion shot was then taken from the synthetic pair.

## Frame times (1920 x 1080, device pixel ratio 1, Apple M5)

Method as in journal 019: `benchmark(120)` = ms per frame pipelined ("thr"), "sync" = one frame at a time with a pixel readback (60 frames after warm-up). Scenes: **pad** = reference-style stack standing on the pad, real sun, vessel and shadows; **liftoff** = the same vessel 3 m up with the lower engine at full throttle and the smoke pool filled (`stepEffects(4)`); **orbit** = the vessel at 100 km with the engine lit and the planet below, camera 15 m away; **orbit wide** = camera 300 m away, the planet filling half the frame (the nearest to plan 019's orbit scene).

| Scene | low thr / sync | medium thr / sync | high thr / sync | plan 019 high thr / sync |
|---|---|---|---|---|
| pad | 3.8 / 5.9 | 6.6 / 8.7 | 8.1 / 10.4 | 9.9 / 13.1 (no vessel meshes of this kind) |
| liftoff, plume + smoke | 4.5 / 5.3 | 8.7 / 10.8 | 12.2 / 14.8 | n/a |
| orbit, vessel close | 1.2 / 1.8 | 2.6 / 3.7 | 3.0 / 3.9 | 8.2 / 14.6 (planet-filling view) |
| orbit wide, planet filling | - | - | 5.9 / 7.1 | 8.2 / 14.6 |

The first measurement of the liftoff scene on `high` was 19.4 / 22.7 ms: 480 large smoke sprites with two noise octaves overdrew the screen. Fixed by smaller sprites (cap about 20 m instead of 28 m), one noise octave, a fade for sprites close to the camera, and capacities 56 / 160 / 320 (was 64 / 192 / 480): 12.2 / 14.8. `high` stays under 16.7 ms in the sync metric in all four scenes. The M1/M2 budget machine is still not measured (same caveat as 019). The pad number is lower than 019's although vessel meshes were added: the 019 pad scene used a different camera, so the two are not comparable in detail; the cost of the vessel was not measured separately.

## Surprises

- `LatheGeometry` smooths the normals across every profile point, so tank collars came out rounded; a own `revolve` with hard edges fixed it (and gives uv in metres for the procedural normal maps).
- A synthetic snapshot has to be consistent with the rotating body: the live vessel sits on surface rails and its inertial position drifts with the planet (6.9 km after 40 s), so fake snapshots must be built by scaling the live position, not by writing `(R + h, 0, 0)`; the first explosion attempt rendered 5 km from the camera.
- The explosion is placed where the part was in the previous snapshot, so a test that drops the vessel from 38 m to 3 m between two snapshots puts the fireball 30 m above it; real snapshots are 20 ms apart.
- Additive plume layers need the facing term to fall off faster in vacuum or the plume becomes a flat-sided diamond; `uVacuum` now also sharpens the fade.
- The plasma shell is an ellipsoid with a smooth windward falloff; its outline still reads as a ball in profile (see self-review).
- `Renderer.setPreset` now rebuilds the part models (and the effect pools); expect a hitch, like for the environment (journal 019).

## Criteria that changed or checks that were added

- The plan's glow criterion asked for plasma intensity above 0.5 at 2 500 m/s and 40 km. With the sim's own heating law that point has a stagnation flux of 1.1e5 W/m^2, which is about where parts start to warm, not where an orbital re-entry glows; the test uses **7 000 m/s at 45 km** (1.5e6 W/m^2, intensity 0.84) instead. Recorded in the plan Log.
- Plume diamonds are asserted for ambient pressure within 0.3 to 1.2 of the exit pressure; the stock engine declares an exit pressure of 90 kPa so that sea level (1.13) shows them.
- Extra tests beyond the plan: revolve winding and hard edges, provider fallback to the shape mesh, glow materials are cloned only when hot, particle determinism, camera hold after destruction, API schema (`packages/core/test/visual.test.ts`), stock descriptors (`mods/stock/test/visuals.test.ts`).

Mutation checks (made the test fail once, then restored): turbopump moved outside the cylinder (`px` 0.34 to 0.6: 2 bounds tests fail), `MAX_EXPANSION` 3.5 to 1.0 (vacuum-width test fails), `MIN_DESTROY_SPEED` 4 to 0 (despawn-at-rest and hot-part tests fail), `GHOST_HOLD` 5 to 0 (camera-hold test fails).

## Test output

```
bun test packages/renderer      118 pass, 0 fail (17 files)
bun test mods/stock             40 pass (incl. visuals)
bun test packages/core          visual schema tests pass
bun test                        573 pass, 0 fail (75 files)
bun run --filter @orbital/web test   146 pass (20 files)
bun run typecheck / build / docs:check / prettier --check   green
```

## Self-review against `product/visual-direction.md`

Question: would a player who knows KSP/KSP2 take these screenshots seriously? Honest answers.

| Direction | Verdict |
|---|---|
| Parts look like what they are: capsule with a cone and window, tanks with bands/rivets/seams, engine with bell and turbopump, decoupler ring, legs with struts and feet, heat shield | Mostly met. Read at pad distance as a real rocket: painted white tanks with a roll stripe, bands, panel seams and rivet rows (normal map), a capsule with windows and a shield, a copper bell with cooling rings and turbopump, a lander with folding legs. Up close it is still simple: the capsule is a drum and a cone (no docking port detail, hatch or antennas), the windows are small flat rectangles, the engine bell is squat, panel lines repeat identically on every tank, decals and numbers do not exist. A KSP2 player would call it "clean low-poly", not "detailed". |
| PBR with subtle wear | Partly. Clear coat on the paint, metal and foil slots, weathering streaks from a tiled noise map. The wear is uniform and repeats, there is no per-part dirt, soot on the engine or scorch near the bell; the foil slot is not used by any stock part. |
| Plume responds to throttle and ambient pressure | Met in data (tests) and visible: narrow bright jet with a white core and bloom at sea level, wider and dimmer in vacuum, flicker, diamonds. It is two shader cones and a glow sprite, so it has no turbulence structure, and the vacuum plume reads as a soft bulb more than a cone. |
| Liftoff smoke and dust | Met in kind, thin in quality. A cloud of tan dust and white smoke billows around the pad and an exhaust trail follows; the sprites are soft noisy discs without lighting depth, the cloud is smaller than the reference, and it is lit by one scalar, not by the sun's direction. |
| Staging separation, re-entry glow, explosions | Met functionally. Gas puff and flash at the decoupler; part glow from temperature with a plasma bubble and streak; fireball, flash, soot and debris. The plasma bubble is visibly a sphere in profile; debris is boxes (not the real part pieces); the explosion needs a real-crash capture; the separation puff is small. |
| Performance | `high` under 16.7 ms sync in the measured scenes on an M5; M1/M2 not measured (inherited caveat). |
| Release readiness | Better, not there. The vessel stopped being a debug object; what would still be torn apart: flat-looking capsule and engine details, the small smoke, the box debris, the bubble plasma, and that there are no radial parts, fins or boosters at all (the stack is a pencil). |

What still looks like a debug view: the debris boxes, the plasma bubble outline, the very regular tank panelling, the launch tower beside the vessel (019) and any shot from far away where the vessel is a few pixels. What is surprisingly good: the engine close-up (bell, ribs, pump, struts), the lander with legs, the vacuum versus sea-level plume comparison and the re-entry streak over the planet limb.

## For plan 022 (3D VAB, catalogue icons) and later

- **Build a model without a snapshot**: `new PartModelFactory({ shapes, visuals, attach, detail })` (all exported from `@orbital/renderer`; `detail: detailOf(PRESETS.high)`), then `factory.create(definitionId)`: a `PartModel` with `root` (add it to any scene), `bounds`, `nodes` (the definition's attach nodes, or the top/bottom faces), `triangles`. Feed it state when you want an animation: `model.setState({ modules: { 'stock.landing-leg': { deployed: true } }, temperature, ambientPressure })` then `model.tick(dt)`. For an icon: create the model, add it to a scene with a few lights, render with an orthographic camera into a small `WebGLRenderTarget`, and dispose the factory with the scene. A whole design: place each part at its attach-node-derived position (the VAB already has the design resolver) and add the model roots to a `Group`; there is no vessel object needed.
- **Materials and light**: materials are `MeshPhysicalMaterial` (paint, glass) and `MeshStandardMaterial` (metal, foil, ablator, nozzle, rubber, lamp) from `factory.materials` (`MaterialLibrary.get(slot, palette)`), lit by the scene: for a hangar, give the scene an environment map (a `PMREMGenerator` render of a simple room or `RoomEnvironment` from three addons), a key `DirectionalLight` with `castShadow` and a hemisphere fill; the exposure of the part materials was tuned for the flight sun (intensity 12 with `ACESFilmicToneMapping`, exposure about 0.7), so scale light intensities down for an indoor scene or set `toneMappingExposure` to 1.5 to 2.5. Parts do not need the planet pass; shaders of the plume are only added when the descriptor has a `plume` and they work without the post chain.
- **Swapping in assets**: implement `PartModelProvider` and pass it in `partProviders` (scene config) or `providers` (factory config); it is asked before the procedural provider and returns `null` for what it does not handle.
- Presets: `PartDetail` has the three knobs (`segments`, `extras`, `textureSize`); catalogue icons can use `extras: 2` at a larger texture size without touching the flight preset.

## Not done / follow-ups

Draft plan 026 collects: radial parts, fins and boosters (needs surface attach in the design format), an asset-backed provider (glTF, KTX2), engine start-up/shutdown/gimbal and plume light on the ground, volumetric smoke and wind, debris from real part meshes, plasma shape from the silhouette, M1/M2 measurements. Not done in this plan: a real (not synthetic) crash capture, audio, per-part wear and decals, the foil slot has no user, `visual.deploy` handles one boolean (no partial states).

## Commits

`76be1e6` (core, API 0.1.6), `7f758ee` (stock descriptors), `c1f0878` (docs), `fcc1be4` (renderer). The HUD session worked in the same tree and its commits swept two shared-index lines of mine: the two `partVisuals`/`partAttach` lines in `apps/web/src/lib/flight-loop.ts` are in `e6931b6` (feat(web): flight HUD) and the `@orbital/mod-stock` line of `bun.lock` is in `d5d6b7c`; the renderer files were staged twice and survived a history rewrite of the other session, so they were committed after the docs.
