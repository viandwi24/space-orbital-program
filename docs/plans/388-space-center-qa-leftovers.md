---
id: 388
title: "Space Center visual QA leftovers: the twin error, loading on software rendering, branch terrain, branch construction, the Build bar"
status: in-progress
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

- [ ] No TSL error on a Space Center load; `twins.test.ts` makes every twin against its scene material and checks each material gives the uniforms its shaders declare.
- [ ] Headless Chromium on SwiftShader reaches the Space Center, or shows the "graphics unavailable" message; never stays on "Starting the graphics".
- [ ] No square grid in a branch's terrain detail.
- [ ] A branch HQ under construction shows its construction state.
- [ ] In build mode the site stays visible above a compact Build bar, and the camera insets follow it.
- [ ] `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md`
- [ ] Journal `388-space-center-qa-leftovers.md`

## Log

- 2026-10-23: Written from the main session's task. Item 1: the plasma wake shares the plume's shaders without `uPeriod`; the plume twin read it inside a `Fn`, so the node build failed (three then draws the fallback material and logs the error).
