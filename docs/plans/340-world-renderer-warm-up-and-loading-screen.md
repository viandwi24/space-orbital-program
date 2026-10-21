---
id: 340
title: "One renderer for the world session, shader warm-up at world load, and a real loading screen"
status: done
owner: "world renderer session"
depends: [261, 204, 113]
phase: 8
created: 2026-10-22
updated: 2026-10-22
---

# 340 — One renderer for the world session, shader warm-up at world load, and a real loading screen

**Size:** L

## Goal

The owner asked for this on 2026-10-22, in their words:

- "loading nya itu dilakukan diawal load game ... jangan di tengah tengah ... loading shaders atau apa itu diawal game atau diawal load worlds. terus setelah itu jangan ada loading lagi, kalau ada loading pun kasih halaman khusus ... jangan cuman ada hud tapi canvasnya blackscreen"
- "dalam satu halaman ... sekarang kan ganti ganti url kaya mission center, flight atau vab ... ada bottleneck kaya freeze sedikit saat redirect ... dari flight / vessel itu ke map atau mission center disitu ada freeze beberapa detik bisa 3 - 6 detik"

So all loading happens once, when the world loads, behind a real loading page. After that, moving between Flight, Map, the Mission Center and the Space Center does not freeze.

## Context

- Plan 261 (ADRs 0247–0249) is the WebGPU renderer and its warm-up frames (`renderer-webgpu.ts`, `planet.forceScale`). three builds one pipeline per object and render target. A light that shows, or a mesh that first becomes visible, rebuilds shaders.
- Plan 204 (ADR 0201) is the world session: one sim for every in-world page, owned by `routes/(world)/+layout.svelte`.
- The three loops are `lib/flight-loop.ts`, `lib/mission-center/mission-center-loop.ts` and `lib/space-center/space-center-loop.ts`. Each calls `createRenderer`.
- ADR 0290 is this plan's design.

## Scope

**In:**
- `SceneModel.warmViews` and `Renderer.resetView`.
- A `warm` precompile stage on both backends.
- `lib/world-renderer.svelte.ts` and the layout's canvas holder and loading screen.
- The three loops on the shared renderer.

**Out:** the Hangar's own renderer; merging the pages into one route (ADR 0290, alternatives).

## Steps

1. Measure before, on WebGPU and WebGL, with `apps/web/scripts/.tmp-measure.ts` (untracked):
   - boot to the first drawn frame;
   - Flight → Map and back (worst frame);
   - Flight → Mission Center and back;
   - Space Center → Flight.
2. Renderer:
   - `SceneModel` keeps the last snapshot.
   - `warmViews(draw)` draws flight with the effects shown, map in vessel and system scope, and site view, then puts the view state back.
   - `resetView()`.
   - Both backends' `precompile` call `warmViews` after the programs, in a `warm` stage.
3. `world-renderer.svelte.ts`:
   - one canvas, created on the world client's catalog, kept across clients with the same fingerprint;
   - `acquire`/`release` move the canvas between page hosts and a hidden holder;
   - ready once the warm-up and a later frame are done;
   - draws in the holder while it warms up with no page holding it;
   - `dispose` when the world ends.
4. Layout: the holder and the loading screen, with steps and progress, over the 3D pages until ready.
5. Loops and pages: acquire instead of `createRenderer`, `resetView` then their mode, release instead of dispose. Flight's canvas handlers move to listeners.
6. Measure after; screenshots; docs; checks; commit and push.

## Acceptance criteria

- [x] `bun run typecheck`, `bun test`, `bun run build`, `bun run docs:check` pass.
- [x] Moving Flight → Mission Center → Flight → Space Center → Flight keeps the same renderer object (the measurement script prints `same renderer true`).
- [x] No HUD over a black canvas at boot: the loading screen shows until the first complete frame.
- [x] The worst frame on Flight → Mission Center and back, and Space Center → Flight, is far below the before numbers on WebGPU and WebGL (table below).

## Measurements

Apple M2, Chromium (Playwright, headful, Metal ANGLE), 1440×900, dev server, booster from `__orbitalVab.loadBooster()`. Worst rAF interval in the window after the action; "over 100" is the sum of intervals longer than 100 ms.

| | WebGPU before | WebGPU after | WebGL before | WebGL after |
|---|---|---|---|---|
| Boot: vessel in the snapshot | 4.1 s | 4.3 s | 4.6 s | 2.7 s |
| Boot: first drawn frame | 4.3 s | 4.6 s (under the loading screen) | 5.8 s | 2.8 s |
| Boot: loading screen gone | none (HUD over the canvas) | 7.1 s | none | 2.9 s |
| 8 s after that: worst / over 100 | 2,185 / 7,251 ms | 567 / 567 ms | 19 / 0 ms | 19 / 0 ms |
| Flight → Map, first time | 1,183 ms | 167 ms | 150 ms | 152 ms |
| Map → Flight, Flight → Map again | 19 ms | 19 ms | 19 ms | 19 ms |
| Flight → Mission Center #1 / #2 | 2,833 / 1,450 ms | 19 / 19 ms | 233 / 218 ms | 19 / 19 ms |
| Mission Center → Flight #1 / #2 | 2,485 / 2,533 ms | 19 / 19 ms | 383 / 400 ms | 19 / 19 ms |
| Flight → Space Center | 1,750 ms | 19 ms | 250 ms | 19 ms |
| Space Center → Flight | 2,383 ms | 19 ms | 383 ms | 19 ms |
| Same renderer after the switch | no | yes | no | yes |

19 ms is one frame at 60 Hz with nothing longer. What is left:
- The first Flight → Map (about 150 ms on both backends) builds the map HUD and the path lines, which are made on demand.
- WebGPU: one 567 ms frame in the 8 s after the loading screen. It is the background stage (the other presets' vegetation) or Flight's first HUD frame.

Both are under a second. Plan 342 (draft) takes them.

Screenshots (before and after, both backends) are in the session's scratchpad. They are not committed, as with plan 261's.

## Docs checklist

- [x] STATUS row (340, and draft 342), ADR 0290 and its index row, `architecture/overview.md` (the world's renderer, the Space Center paragraph), journal 340.

## Log

- 2026-10-22: Created and done by the world renderer session from the owner's request (started early on their word).
  - Measurements before (a clean worktree of 02cd7bb7) and after are in the table above, from `apps/web/scripts/.tmp-measure.ts` (untracked).
  - Checks: see the session's report (typecheck, test, build, docs:check). e2e skipped as asked.
