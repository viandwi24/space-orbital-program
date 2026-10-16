# 008 — Renderer: floating origin

**Plan:** plans/008-renderer-floating-origin.md · **Session:** renderer session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The plan was `draft`; refined to `ready` first at the human's request (Three.js docs verified, concrete steps, see the plan Log and `research/three.md`), then implemented. No scaffolding (package skeleton from plan 001; `three` and `@types/three` were already in the catalog).

| File | Contents |
|---|---|
| `src/origin.ts` | pure floating origin: `updateOrigin`, `needsRebase`, `snapToGrid` (1024 m grid), `toRenderSpace`, default threshold 10 km |
| `src/orbit-line.ts` | pure `sampleOrbit(elements, { segments, maxRadius })`; ellipse by uniform eccentric anomaly, hyperbola by hyperbolic anomaly clipped at `maxRadius`; frame map I = x, J = −z, K = y |
| `src/camera-rig.ts` | pure yaw/pitch/distance rig (not in the original step list; keeps camera math testable) |
| `src/scene.ts` | `SceneModel` (Three `Scene` + `PerspectiveCamera`, no `WebGLRenderer`): bodies, vessel groups, placeholder part meshes, origin handling, camera follow, map-view switch |
| `src/map.ts` | `OrbitLine` (`Line2` + `LineMaterial`, re-sampled only when elements change), `VesselMarker` |
| `src/renderer.ts` | `createRenderer({ canvas, bodies, partShapes })` over `WebGLRenderer({ antialias, logarithmicDepthBuffer: true })` |
| `test/*.test.ts` | origin, orbit-line, camera-rig, scene model (21 tests) |

## What surprised me

- `@orbital/core` does not export `OrbitalElements` by name (ADR 0011 uses it only inside `VesselSnapshot`). The renderer declares `type OrbitalElements = NonNullable<VesselSnapshot['orbit']>`. A named re-export from core would be cleaner; left to a core owner.
- Core Three classes (`Scene`, `Mesh`, `Group`, `PerspectiveCamera`) and even `Line2` construct fine under Bun without WebGL, so the whole scene graph is unit-tested; only `WebGLRenderer` is untested until plan 009.
- The "relative positions exact within 1e-9" criterion is only meaningful if `world − origin` is exact. Snapping the origin to a power-of-two grid makes the subtraction exact in float64 even at 1.5e11 m, so the test runs at planetary magnitude and passes with room to spare.
- Frames were cross-checked once against `@orbital/kepler.toStateVector` in a throwaway test (nearest of 400 samples within 0.44% of the true position for three elliptic/hyperbolic orbits, including i near π). Not committed: the renderer must not depend on kepler.
- Mutation checks: `>` → `>=` in `needsRebase` fails the threshold test; flipping `z: -J` fails three orbit-line tests.
- `PartSnapshot.position/orientation` are documented as "relative to the vessel root, in the same orientation as the frame". The renderer applies them as given and does not rotate them by `VesselSnapshot.orientation`. If plan 007 means vessel-body-frame offsets, the vessel `Group` needs the vessel quaternion and this must be changed (one line in `syncParts`/`sync`). Needs confirming in plan 007.

## Decisions made

- ADR [0012](../decisions/0012-renderer-part-shapes-host-supplied.md): part shapes (and body radii via `BodyDefinition`) are host-supplied inputs; `PartDefinition` has no dimensions.
- Camera near/far 0.1 m / 1e13 m with the log depth buffer. Map view anchors the origin on the SOI body, flight view on the active vessel.

## Open questions / follow-ups

- Plan 006/009: provide `partShapes` (a `shape` field on part definitions would be the natural source; needs an ADR in the plan that adds it).
- Plan 007: confirm the part-offset frame (above) and whether snapshots for non-active vessels are sent at all.
- Not done (out of scope): interpolation between snapshots, GLTF meshes, bodies' colours/textures (fixed palette), SOI-radius clipping of hyperbolic lines (host can pass `maxRadius` later; `SceneModel` currently uses the default 10 × periapsis), vessel-orientation rendering. None warrant a plan yet; plan 009's manual run will show what is needed.

## Verification output

```
$ bun test packages/renderer      21 pass, 0 fail
$ grep -rn "@orbital/sim" packages/renderer/src      (no output)
$ bun test                        168 pass, 0 fail (20 files)
$ bun run typecheck               all packages Exited with code 0; @orbital/web check 0 ERRORS
$ bun run build                   @orbital/web build ✔ done
$ bunx prettier --check packages/renderer   All matched files use Prettier code style!
```
