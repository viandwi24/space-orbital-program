---
id: 008
title: "Renderer: floating origin"
status: done
owner: "renderer session (Claude, 2026-10-16)"
depends: [003]
phase: 1
created: 2026-10-16
updated: 2026-10-16
---

# 008 — Renderer: floating origin

## Goal

`@orbital/renderer` draws a snapshot with Three.js: a sphere for the home body, placeholder meshes for parts (box/cylinder from part dimensions), a camera that follows the active vessel, floating origin re-centring, logarithmic depth buffer, and a map-view mode that draws the orbit line from `OrbitalElements`. It never mutates sim state.

## Context

- Read: `docs/architecture/units-and-frames.md` (floating origin, +Y up, "Orbital elements" frame conventions), `simulation.md` (snapshot shape), `boundaries.md` (renderer may import only `core` and `three`).
- ADRs: 0003, 0007.
- Research: `docs/research/three.md` (verified 2026-10-16: `WebGLRenderer({ logarithmicDepthBuffer })`, `PerspectiveCamera`, `Line`, `Line2` from `three/addons/lines/*`, GLTF later).
- Journals: `003` (snapshot types, `OrbitalElements` reaches the renderer only through `VesselSnapshot.orbit`), `002` (element conventions).

## Scope

**In:** the above; a tiny headless-ish test strategy: renderer math (origin shifting, orbit sampling, camera rig) in pure functions, and the Three scene graph (`Scene`/`Mesh`/`Group`/`PerspectiveCamera` need no WebGL) tested in Bun. Only `WebGLRenderer` creation/drawing needs a browser; that is checked by plan 009's manual run.
**Out:** real art, terrain, atmosphere scattering, post-processing, GLTF loading, interpolation between snapshots, mouse/touch event wiring (the host feeds camera input as numbers).

## Design notes

- **Inputs the host gives the renderer** (plain data, no `sim` import): `bodies` (`Pick<BodyDefinition, 'id' | 'radius'>[]`, from core) and `partShapes` (`ReadonlyMap<string, PartShape>`, renderer-local type; unknown part ids fall back to a 1 m box). [ADR 0012](../decisions/0012-renderer-part-shapes-host-supplied.md) records why shapes are a host-supplied lookup.
- **Coordinates:** world position of a vessel = `body(soi).position + vessel.position` (float64, root inertial frame). Render position = `world − origin` in float64, only then converted to Three's float32. The origin is snapped to a 1024 m grid (a power of two) so `world − origin` is exact in float64.
- **Origin shift:** triggers only when the anchor is farther than the threshold from the current origin (default 10 000 m, `units-and-frames.md`); a shift moves the origin to the snapped anchor.
- **Orbit sampling:** core does not re-export kepler functions and the renderer may not import kepler, so `orbit-line.ts` samples the conic itself (uniform eccentric anomaly for `e < 1`, hyperbolic anomaly clipped to a max radius for `e > 1`), then applies the frame conventions of `units-and-frames.md` (textbook `I = x, J = −z, K = y`).
- **Camera:** orbit rig around the active vessel (yaw/pitch/distance), numeric inputs. Map view: camera orbits the SOI body, orbit line + vessel marker drawn, part meshes hidden.

## Steps

1. `src/origin.ts` (pure): `snapToGrid`, `needsRebase`, `updateOrigin(origin, anchor, threshold)`, `toRenderSpace`. `src/orbit-line.ts` (pure): `sampleOrbit(elements, { segments, maxRadius })` → `Vec3[]` relative to the SOI body. `src/camera-rig.ts` (pure): yaw/pitch/distance state, input application with clamping, offset vector.
2. `src/scene.ts`: `createSceneModel({ bodies, partShapes })` → Three `Scene`, `PerspectiveCamera` (near 0.1 m, far 1e13 m), `sync(snapshot, view)` that adds/updates/removes body spheres and vessel groups with part placeholder meshes (`BoxGeometry`/`CylinderGeometry`) and re-centres the origin; `src/map.ts`: orbit line (`Line2` + `LineMaterial`) and vessel marker, `setResolution`. `src/renderer.ts`: `createRenderer({ canvas, bodies, partShapes })` wrapping `WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true })` with `update(snapshot)`, `render()`, `resize()`, `setMapView/toggleMapView`, `setActiveVessel`, camera inputs, `dispose()`.
3. Tests for pure parts and the scene model (never mutate snapshots); ADR for part-shape input; journal.

## Acceptance criteria

- [x] `bun test packages/renderer` passes: origin shift triggers only beyond threshold and keeps relative positions exact (within 1e-9, tested at planetary magnitudes ~1e11 m) after shift; orbit sampling of a circular orbit yields points at constant radius within 1e-6 m.
- [x] `grep -rn "@orbital/sim" packages/renderer/src` returns nothing (renderer depends on `core` types only); likewise `@orbital/kepler` and `rapier`.
- [x] `bun run typecheck`, `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md`, journal, research (Three.js), `architecture/units-and-frames.md` if thresholds changed.

## Log

- 2026-10-16 — Created as draft.
- 2026-10-16 — Refined draft → ready at the human's request (session: renderer session). Added Design notes and concrete steps; verified Three.js docs (`research/three.md`); acceptance criteria kept, only made precise (magnitude of the 1e-9 test, extra forbidden imports in the grep).
- 2026-10-16 — Implemented (commit `feat(renderer)`): `origin.ts`, `orbit-line.ts`, `camera-rig.ts` (added, pure; not in the original step list), `scene.ts` (`SceneModel`, WebGL-free, tested in Bun), `map.ts`, `renderer.ts`. ADR 0012 (part shapes are host-supplied). `OrbitalElements` is not exported by name from core, so the renderer derives it from `VesselSnapshot['orbit']`. Orbit frame verified once against `@orbital/kepler` `toStateVector` in a throwaway test (not committed: renderer may not depend on kepler). Done.
