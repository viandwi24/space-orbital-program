# 340 — One renderer for the world, warm-up at world load, and a loading screen

**Plan:** [plans/340-world-renderer-warm-up-and-loading-screen.md](../plans/340-world-renderer-warm-up-and-loading-screen.md) · **Session:** world renderer session (Claude), 2026-10-22 · **ADR:** 0290

## What was done

- **Measured first.** On WebGPU:
  - every switch between Flight, the Mission Center and the Space Center froze for 1.5–2.8 s;
  - after boot, 7.3 s went into long frames while the HUD sat over a black or half-drawn canvas.

  On WebGL, the switches cost 0.2–0.4 s. The cause: each page's loop called `createRenderer` and `dispose`, so each switch built a device, a scene, terrain bakes and every pipeline again.
- **One renderer per world** (`apps/web/src/lib/world-renderer.svelte.ts`). The `(world)` layout owns it.
  - The page loops call `worldRenderer.acquire(host, client)`. The canvas element moves into the page's host `<div>`, which keeps its context. Then `resetView()` runs, then the page's mode.
  - `release` moves the canvas back into a hidden holder. The renderer is disposed only when the world ends, or when another tab takes it.
  - The pages' `<canvas>` became `<div class="view">` hosts. Flight's pointer handlers stay on the host, because the canvas's events bubble up to it.
- **Warm-up.** `SceneModel.warmViews(draw)` draws one frame each of:
  - flight, with every hidden effect mesh shown (after `prepareFrame`, which would hide them again);
  - map in vessel scope;
  - map in system scope;
  - the site view.

  It then puts the view state back. Both backends' `precompile` run it in a new `warm` stage, after the programs and before maps and vegetation. The world renderer calls `precompile` itself, so the Mission Center and Space Center warm up too; before, they never called it.
- **Loading screen.** `LoadingScreen` gained a list of steps and a progress bar. The layout shows it over `/flight`, `/mission-center` and `/space-center` until the renderer has drawn two frames after the warm-up. The steps are: starting the world, the graphics, programs, views, first frame.

## Surprises

- The heavy-job lock `/tmp/orbital-heavy.lock` had become a plain file held with `lockf -k` by another session, so `until mkdir …` never got it. This session used `lockf -k` on the same path.
- The dev server serves the worktree, so the "before" numbers came from a clean `git worktree` of HEAD on a second port. Editing while measuring would have hot-reloaded the page being measured.

## Verification

- The measurement table is in the plan. Every page switch is now 19 ms worst on both backends, and the same renderer object is used across Flight → Mission Center → Flight → Space Center → Flight.
- `bun run typecheck`, `bun run test`, `bun run build` and `bun run docs:check`: see the plan's acceptance criteria.

## Open

- Plan 342: about 150 ms on the first map toggle; one 567 ms frame on WebGPU after the loading screen.
- With MC as the world's first page, the site view warms up without the player's buildings: none are set yet. Their materials are shared, so this has not shown up in the numbers.
