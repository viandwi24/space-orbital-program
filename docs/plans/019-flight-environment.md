---
id: 019
title: "Visual: flight environment (sky, planet, launch site, lighting)"
status: done
owner: "environment session (Claude, 2026-10-16)"
depends: [008, 016]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 019 — Visual: flight environment

## Goal

The flight view stops looking like a debug scene. The home planet reads as a planet from the pad and from orbit, with a sky and atmosphere, a sun with shadows, a launch site that gives scale, clouds, stars, tone mapping and bloom, all procedural and within the performance budget of `docs/product/visual-direction.md`.

## Context

- Read: `docs/product/visual-direction.md` (the bar), `docs/architecture/units-and-frames.md` (floating origin, +Y north, body rotation), `packages/renderer/src/*`, ADRs 0007, 0012, 0024, journals 008, 009, 016, 017.
- Requested by the human on 2026-10-16 (screenshot comparison with KSP2: "environment like this now would get torn apart in public").

## Scope

**In:** sky dome / atmosphere scattering (day, sunset, space), sun light + shadows following the vessel, ACES (or similar) tone mapping and sRGB output, bloom; planet surface shading (procedural colour by height/slope/noise: grass, dirt, rock, sand, ocean), near-pad detail and a far/orbit view with an atmospheric rim and night side; procedural launch site (pad, tower, apron, a few buildings/props) placed at the stock launch location and rotating with the body; cloud layer; starfield; graphics presets (low/medium/high) for the environment; frame-time measurement.
**Out:** part meshes and effects (020), HUD (021), terrain height/collision (physics stays on the reference sphere), external assets.

## Design notes

- Renderer stays a pure consumer of snapshots. Sun direction derives from body rotation and a fixed star direction (pure function, tested).
- Precision: planet-scale geometry with floating origin and log depth (already in place); near-pad detail must not swim.
- Keep shaders and generators in `packages/renderer` behind small modules (`sky.ts`, `planet.ts`, `launch-site.ts`, `post.ts`) with pure maths split out for Bun tests.

## Steps

1. Refine: verify three.js docs (`EffectComposer`, `UnrealBloomPass`, `OutputPass`, `Sky`, shadows, `InstancedMesh`, `PMREMGenerator`), write ADR 0027 (done, see Log).
2. Pure modules with Bun tests: `sun.ts`, `atmosphere-model.ts`, `presets.ts`, `noise.ts`, `planet-map.ts`, `site.ts`, `exposure.ts`, `shadow-fit.ts`.
3. GLSL passes and scene wiring: `planet.ts`, `lighting.ts`, `site-meshes.ts`, `environment.ts`, `post.ts`; `SceneModel`/`createRenderer` options (`preset`, `launchSite`), `Renderer.setPreset`, dev-only `Renderer.debug`.
4. Web wiring (only `flight-loop.ts` renderer construction and `lib/graphics.ts`).
5. Manual run, screenshots, frame times, journal, self-review.

## Acceptance criteria

- [x] `bun test packages/renderer` passes, including (names are test file groups): sun direction is fixed in the inertial frame and its body-fixed direction turns with the body rotation quaternion; local sun elevation at the launch site at t = 0 is 25..35 degrees and reaches a maximum 3 600 s later; day length equals the rotation period; atmosphere colour ramps (zenith blue exceeds red at noon, sun colour red/blue ratio rises monotonically as the sun lowers, sky luminance at 200 km altitude is below 1 % of the ground value, transmittance monotonic in altitude); preset selection (`selectPreset` for weak/typical/strong capability sets, `parsePreset` rejects junk, each preset table entry is internally consistent and ordered low <= medium <= high); noise is deterministic and in [0, 1]; planet map is deterministic, the launch site is land of the grass biome with margin, ocean fraction is within 25..60 %; site layout is deterministic, nothing overlaps the pad, trees keep clear of buildings; the site frame matches `placeOnSurface` (up/east/south) and co-rotates with the body (angle between sites after dt equals omega dt); shadow fit contains the casters for sun elevations 5..90 degrees and snaps to texels; exposure decreases monotonically with sun elevation.
- [x] Existing renderer tests (origin, camera-rig, orbit-line, scene) still pass (edited only where the body mesh moved into the planet pass; edits listed in the Log).
- [x] `[manual]` Screenshots from the real WebGL pipeline, saved as `docs/journal/assets/019-*.png`: `019-pad-noon.png`, `019-pad-low-sun.png`, `019-ascent-20km.png`, `019-orbit-day-rim.png`, `019-orbit-night.png`, `019-map-view.png` (orbit line and markers still drawn, occluded by the planet), taken through a deterministic dev-only camera/time preset (`Renderer.debug`) except the orbit and ascent shots, which use the real sim state.
- [x] `[manual]` Frame time (ms, CPU+GPU throughput over 300 back-to-back frames) at 1920x1080 for low, medium and high recorded in the journal with the machine; high stays within the ADR 0025 budget or the shortfall is stated.
- [x] `[manual]` Written self-review against `docs/product/visual-direction.md` in the journal, naming what still falls short.
- [x] No console errors or shader warnings in the browser during the manual run.
- [x] `bun test`, `bun run typecheck`, `bun run build`, `bun run --filter @orbital/web test`, `bun run docs:check` pass; `bunx prettier --check packages/renderer apps/web/src/lib/graphics.ts` clean.

## Docs checklist

- [x] `docs/STATUS.md`, journal 019, ADR 0027 (+ index), `docs/research/three.md`, `docs/architecture/overview.md` renderer notes, `docs/product/glossary.md` terms, draft plans for pushed-out scope.

## Log

- 2026-10-16 — Created as draft at the human's request (visual overhaul, code-only).
- 2026-10-16 — Refined draft -> ready at the human's request (session: environment session). ADR 0027 written; criteria made measurable (nothing from the draft weakened).
- 2026-10-16 — Status in-progress (owner: environment session). ADR number: 0026 was taken by the HUD session during refinement, this plan's ADR is 0027.
- 2026-10-16 — Criterion edit during implementation: dropped "periodic where claimed" from the noise test (the shader noise is lattice value noise with integer anchors, not tiled textures; ADR 0027 item 4), and made the preset test expect Apple M1/M2 -> `medium`, M3+ -> `high` after the frame-time measurement (journal 019). Nothing weakened otherwise.
- 2026-10-16 — Existing renderer tests: `scene.test.ts` looked the body up as a scaled `Mesh` child of the scene; the first body is now the planet pass, so the tests use `SceneModel.bodyObject(id)` (3 lines). New tests: launch-site lock, explicit site, camera above ground, map camera before first placement.
- 2026-10-16 — Evidence: `bun test packages/renderer` 64 pass; `bun test` 509 pass; web tests 141 pass; typecheck, build, docs:check green; prettier clean; manual screenshots, frame times and self-review in `journal/019-flight-environment.md`. Orbit night/terminator/day shots and the ascent shot are from the real sim (autopilot + time warp); the map-view shot uses a synthetic snapshot (stated in the journal).
- 2026-10-16 — Done. Deviations: launch site taken from the first vessel near the ground (the sim places vessels at an inertial longitude, journal "Surprises"); medium preset uses 4x MSAA; M1/M2 frame times not measured.
