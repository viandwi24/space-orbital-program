---
id: 388
title: "Space Center visual QA leftovers: the twin error, loading on software rendering, branch terrain, branch construction, the Build bar"
status: done
owner: "space-center QA fixes session (Claude, 2026-10-23)"
depends: [387]
phase: 7
created: 2026-10-23
updated: 2026-10-23
---

# 388 — Space Center visual QA leftovers

## Goal

Fix what plan 387's visual QA pass listed for other owners (journal 387, "Listed for their owners").

## Context

- ADR [0329](../decisions/0329-space-center-qa-leftovers.md) (this plan's decisions)

- Journal `387-space-center-camera-and-visual-qa.md` and its screenshots `assets/387-*.jpg`
- `packages/renderer/src/tsl/twins.ts` (plan 261), the loading screen in `apps/web/src/lib/world-renderer.svelte.ts` (plans 340, 370), branch sites (plans 236, 384), terrain detail (plan 364)

## Scope

**In:**
1. The `THREE.TSL: TypeError ... reading 'value'` error on every Space Center load (and in Flight).
2. Loading that never leaves "Starting the graphics" on software rendering (SwiftShader), even after "Continue with lower quality": a timeout and a fallback (WebGPU → WebGL2 → a "graphics unavailable" message with tips).
3. The square grid in the snow and sand detail on a branch's terrain.
4. A branch HQ under construction drawn as finished.
5. The Build bar covering the lower third of the site in build mode.
6. Check night lighting across warp and z-fighting up close; fix if broken.

**Out:** e2e (the owner tests by hand on the deployed site).

## Acceptance criteria

- [x] No TSL error on a Space Center load; `twins.test.ts` makes every twin against its scene material and checks each material gives the uniforms its shaders declare.
- [x] Headless Chromium on SwiftShader reaches the Space Center, or shows the "graphics unavailable" message; never stays on "Starting the graphics".
- [x] No square grid in a branch's terrain detail.
- [x] A branch HQ under construction shows its construction state.
- [x] In build mode the site stays visible above a compact Build bar, and the camera insets follow it.
- [x] `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check` pass (the web's `sim-host-script-worker.test.ts` fails 2 of 5 on this machine before and after this plan; journal 388).

## Docs checklist

- [x] `docs/STATUS.md`
- [x] ADR 0329 and its index row
- [x] Journal `388-space-center-qa-leftovers.md`

## Log

- 2026-10-23: Written from the main session's task. Item 1: the plasma wake shares the plume's shaders without `uPeriod`; the plume twin read it inside a `Fn`, so the node build failed (three then draws the fallback material and logs the error).
- 2026-10-23: Item 2: on SwiftShader `navigator.gpu.requestAdapter()` never answered, so `rendererBackend()` held the load before any renderer existed, and "Continue with lower quality" returned at once without one. The probe now gives up after 4 s (WebGL); a load still on "Starting the graphics" after 20 s on WebGPU (three's own `init()` hanging) reloads the tab on WebGL (a session flag), and on WebGL says the graphics are unavailable with tips; lower quality during that step saves `low` and leaves WebGPU at once. SwiftShader reaches the Space Center on WebGL in about 60 s.
- 2026-10-23: Items 3 to 6. The branch's grid came from the planet pass measuring its site distance from the HQ only (field cells, relief, rivers on) and from detail tiles read at coarse mips. A building under construction is a building site. The Build bar is compact and folds. Checking the night across a warp found the site spinning on screen, fixed with a site-fixed camera frame. No z-fighting close to the Hangar. Done; screens in journal 388.
