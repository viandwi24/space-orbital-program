# 0027 — Environment rendering pipeline: analytic planet and sky, one sun, post chain, presets

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/019-flight-environment.md

## Context

ADR 0025 sets the visual bar. The flight scene must show a launch pad from 2 m, an ascent through the atmosphere and the whole planet from orbit, in one camera, with float32 GPU precision, a logarithmic depth buffer (ADR 0007) and a floating origin. The planet is 600 km in radius with a 70 km atmosphere; physics keeps a sphere with a flat ground tile (no terrain heights).

## Decision

1. **Planet and sky are one analytic fullscreen pass** (`planet.ts` + `shaders/`). A screen-covering triangle intersects the view ray with the exact planet sphere and the atmosphere sphere in the fragment shader. A tessellated sphere was rejected: 64 x 32 segments sag 700 m below the true surface at the pad, and any mesh needs LOD to hold up from 2 m to 1000 km. The pass writes a correct logarithmic `gl_FragDepth` so vessel, pad, orbit lines and markers sort against it.
2. **Atmosphere: custom single-scattering Rayleigh + Mie ray march**, evaluated from any altitude (ground to orbit), the same model as a TypeScript twin (`atmosphere-model.ts`) that supplies the sun colour, ambient colour, fog colour and exposure on the CPU and is unit-tested. The three.js `Sky` addon (Preetham) was rejected: it is a ground-level dome, with no planet curvature, rim or view from space.
3. **Planet surface**: a coarse equirectangular biome map (elevation, moisture, rock) generated at start from seeded noise in TypeScript (`planet-map.ts`, tested: the launch site is grass, ocean fraction is bounded), refined in the shader by hash-noise octaves whose cut-off follows the pixel footprint. Bump relief from screen derivatives; no geometry. Ocean has Fresnel and sun glint.
4. **Precision**: the ray hit uses the stable root `t = c / (-b + sqrt(b^2 - c))` with `c = h (2R + h)` from a float64 altitude `h`; fine detail coordinates are relative to an anchor that is a multiple of 1024 m in body-fixed axes, so noise cells use `anchorCell * 2^k + floor(local / lambda)` in integers and never lose bits. Launch-site meshes sit under a group placed in float64 on the CPU and turned with the body; their children are metres from the group origin.
5. **Launch site** (`site.ts`, `site-meshes.ts`): pure layout (seeded) plus meshes in the site frame (east, up, south of `placeOnSurface`); the pad, apron and roads are painted by the ground shader (flush with the ground the sim stands the vessel on, so nothing intersects the vessel); tower, masts, tanks and buildings are merged meshes with `MeshStandardMaterial`; trees and rocks are `InstancedMesh`. The site is at latitude 0, longitude 0, the default of `load-vessel` surface placement; the host may pass another.
6. **Light**: one `DirectionalLight` sun (direction = fixed star direction in the inertial frame, colour = atmosphere transmittance, so low sun is warm), one `HemisphereLight` for sky ambient, a PMREM environment from a procedural sky refreshed when the sun or altitude changes enough. One shadow map follows the vessel (texel-snapped, extent adapts to the launch site and altitude); the ground pass samples the same depth texture. CSM was rejected: its cascades split the camera frustum, ours is a few hundred metres around the vessel.
7. **Post chain** (`post.ts`): `EffectComposer` with a multisampled half-float target, `RenderPass`, `UnrealBloomPass`, `OutputPass` (ACES filmic tone mapping and sRGB are applied there, as the renderer's `toneMapping`). Custom shaders write linear HDR and include the tone mapping and colour space chunks so the same material works without the chain.
8. **Presets** `low | medium | high` (`presets.ts`): shadow map size, MSAA, bloom, ray-march sample counts, cloud and detail octaves, trees. The default comes from a pure `selectPreset(capabilities)`; the host persists the choice (`apps/web/src/lib/graphics.ts`) and calls `renderer.setPreset`.
9. **Clouds**: one shell at 3.5 km (noise coverage, sun-side lighting, shadow on the ground by projecting along the sun ray); no volumetrics.
10. **Stars** are procedural in the same shader, attenuated by the atmosphere.
11. **Launch site from the first vessel.** `placeOnSurface` puts a vessel at an *inertial* latitude/longitude at load time; with the body already turning, the vessel is at body-fixed longitude `-omega * t_load` (about 160 m at a 1 s boot), not at (0, 0). The renderer therefore defines the launch site from the first vessel seen within 150 m of the ground (`SceneModel.lockLaunchSite`), unless the host passes `launchSite`. A sim change (place at body-fixed coordinates, or put the launch site in the snapshot) would remove the heuristic; recorded in plan 019's journal as a follow-up, not done here (sim is outside this plan).
12. **Dev tooling**: `Renderer.debug` (fixed sun, camera rig, pixel ratio, benchmark, scene access) is part of the facade, but only `apps/web` decides whether to expose it (dev builds only); `DEBUG_VIEW`/`DEBUG_NAN` shader defines are never set by the renderer.

## Alternatives considered

- Sphere mesh with geometry clipmaps: more code, seams and still needs float-safe texturing; revisit with terrain heights (Phase 3).
- Post-process atmosphere with a depth texture: log depth makes distance reconstruction awkward and costs a full-screen pass over depth anyway.
- Precomputed multi-scattering LUTs (Bruneton): better look, much more code; single scattering with a brightness factor is enough for this bar.

## Consequences

- The renderer owns shaders and generators; pure maths stays in separate modules tested under Bun. GLSL is verified only in a real browser (journal 019).
- Only the SOI body that the camera is nearest to gets the analytic pass; other bodies stay simple lit spheres until a plan needs more.
- Plan 020 builds on the light and material conventions above (sun, hemisphere, `scene.environment`, tone mapping in the output pass, `castShadow` on parts).
