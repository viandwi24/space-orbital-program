---
id: 347
title: "Mod overlays (world-space lines, markers, labels) and the Trajectories mod"
status: done
owner: "mod world API session (Claude)"
depends: [343]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 347 — Mod overlays and the Trajectories mod

## Goal

A mod can draw in the 3D view and the map without touching three.js: it hands the game polylines, markers and labels at world points, and the renderer draws them. The showcase is a built-in Trajectories mod, on by default: the predicted path of the flown vessel through the air down to the ground, with a cross-hair at the impact point and an optional landing target.

## Context

- Owner (2026-10-22), showing KSP's Trajectories mod: "bisa ngga bikin fitur kaya gini ... dalam mod aja bisa ngga? jadi defaultnya nyala, jadi modnya ambil data aja dari ship/vesselnya terus draw ke canvasnya atau ke 3d nya ... ini bisa jadi use case example untuk penggunaan mod".
- ADR 0292 (World API), ADR 0149 (panels read the snapshot), ADR 0155 (range safety: `conicImpact` is a vacuum conic, no drag), ADR 0017 (per-part drag), ADR 0204 (atmosphere, Mach drag), ADR 0043 (one terrain height function). New **ADR 0296**.
- Renderer: `OrbitLine`/`LineMaterial` (fat lines) draw on WebGL and, through their TSL twin, on WebGPU (`tsl/twins.ts`).

## Audit (2026-10-22)

| Need | Today | This plan |
|---|---|---|
| Draw lines, markers, labels in the 3D view and map | missing (only the host's own map path, region overlay) | `defineOverlay`, shapes in core, `Renderer.setOverlays` |
| Feed shapes from a system (sim) | missing | `ctx.overlays.set(id, shapes, meta)`, `Snapshot.overlays` (not saved) |
| Feed shapes from the page | missing | `OverlayDefinition.draw(input)` at its `rate` |
| Budgets, no three.js for mods | — | `clampOverlay`: 64 shapes, 4 096 points, 16 labels per overlay |
| Per-mod toggle | — | Settings → Overlays, `defaultOn` |
| Air density, Mach drag for mods | sim-only | `ambientAt`, `machDragFactor` move to core; `WorldQuery.atmosphere` |
| Vessel mass and drag area | missing in the snapshot | `VesselSnapshot.aero { mass, dragArea }`; `WorldVessel.mass`, `.dragArea` |
| Body spin, ground height | partly (body rotation in the snapshot) | `WorldBody.angularVelocity`; `WorldQuery.groundHeight` (sim: the terrain; page: null) |
| Impact prediction with drag | missing (range safety is a vacuum conic) | `mods/trajectories` predictor (RK4 with drag in the rotating air) |

## Scope

**In:** the rows above, `mods/trajectories` (built in, on by default), its panel with a landing target, API 0.1.107, guide, tests, a screenshot.
**Out:** thrust during the prediction (coast only; the panel says so), lift, a dashed line in screen pixels (dashes are in metres), e2e.

## Steps

1. Plan, ADR 0296.
2. Core: `overlays.ts` (shapes, definition, schema, `clampOverlay`), atmosphere in core, world query additions, `Snapshot.overlays`, `VesselSnapshot.aero`; tests.
3. Sim: `ctx.overlays`, snapshot overlays, aero facts, ground height in the sim's query; tests. Commit, push.
4. Renderer `setOverlays`; web: page-side overlays, merge, toggles, Settings section. Commit, push.
5. `mods/trajectories`: predictor, system, panel, store, keys; tests (impact matches a sim fall); built in. Commit, push.
6. Guide, journal, STATUS, screenshot. Commit, push.

## Acceptance criteria

- [x] `bun test packages/core/test/overlays.test.ts`: shapes validated and clamped to the budgets.
- [x] `bun test packages/sim/test/mod-overlays.test.ts`: a system's overlay reaches the snapshot, another plugin's id is refused, overlays are not saved; `aero` is set.
- [x] `bun test mods/trajectories`: a probe dropped from 30 km lands within 2 % of the flight distance of the predicted impact; the target and its error.
- [x] web vitest: overlay merge, toggles, page-side `draw` at its rate.
- [x] A screenshot of the arc and cross-hair in Flight.
- [x] `bun run typecheck`, `bun run docs:check` pass.

## Docs checklist

- [x] ADR 0296.
- [x] `docs/guides/writing-a-mod.md`: Overlays, the Trajectories walk-through, API 0.1.107.
- [x] `docs/STATUS.md`, journal 347.

## Log

- 2026-10-22 — Audit written; implementing.
- 2026-10-22 — Done. `bun test mods/trajectories packages/core/test/overlays.test.ts packages/renderer/test/overlay-layer.test.ts packages/sim/test/mod-overlays.test.ts`: 9 pass; the drop: "predicted 92 s over 78321 m; flew 91 s; missed by 971 m". Full `bun test ./packages ./mods ./examples ./tools` (machine shared with Chromium and a dev server, 2 574 s): 2243 pass, 6 fail: two resume-determinism tests (the drag average was not saved; fixed by keeping it on the vessel state) and four timing benchmarks; the six files re-run alone: 62 pass, 0 fail. Web vitest: 1504 pass; `mods/runtime.test.ts` updated for the new built-in (44 pass in its group); the 2 script-worker failures are the Node 26 flag (`--experimental-transform-types`) noted in plan 343. svelte-check 0 errors; package typechecks clean. Screenshot: `journal/assets/347-trajectories-flight.png`.
