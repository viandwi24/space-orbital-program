# 0290 — One renderer for the world session, warmed up behind a loading screen

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/340-world-renderer-warm-up-and-loading-screen.md

## Context

Flight, the Mission Center and the Space Center each called `createRenderer` when their page mounted and `dispose` when it was left. Each switch between them built a new `WebGPURenderer` (or `WebGLRenderer`), a new `SceneModel`, new terrain bakes, and every shader again. three builds one pipeline per object and render target the first time it draws them (plan 261, ADRs 0247–0249), so the first frames of every page stalled. The owner reported:

- 3–6 s freezes on Flight → Map and Flight → Mission Center;
- about 6 s of a black canvas under the HUD when the game starts.

The owner asked for the loading to happen once, when the world loads, behind a real loading page, and for no loading after that. The three configs already matched: Flight passes `siteBuildings: true` too. Only Flight's part visuals, attach points and model providers were extra.

## Decision

1. **One renderer per world session.** `apps/web/src/lib/world-renderer.svelte.ts` holds one canvas and one renderer. The `(world)` layout owns it and disposes it only when the player leaves the world (the layout's teardown, with `worldSession.end()`).
   - It is created from the world client's catalog with the superset config (Flight's): bodies, part shapes, visuals, attach points, model providers, terrain, launch site, site buildings.
   - A new client after a load keeps the renderer when the catalog's fingerprint (bodies, home, terrain, launch site, parts) is the same. A different catalog builds a new one behind the loading screen.
2. **Pages acquire it; they do not create it.** `acquire(host)` moves the canvas element into the page's host element. Moving a canvas keeps its WebGPU or WebGL context. The page's loop then gets the renderer and sets its mode:
   - Flight: flight or map view;
   - Mission Center: map view, system scope;
   - Space Center: site view.

   `Renderer.resetView()` first puts the view state back to a fresh scene's: map and site views off, map scope, focus, highlight, path, region overlay, ghost, part focus, camera mode and rigs. That way, a page never inherits another page's camera.
   - `release` moves the canvas back into a hidden full-viewport holder in the layout. Nothing is disposed.
   - The page's pointer listeners stay the page's. They are added and removed on the shared canvas as before.
3. **Warm-up at world load.** `precompile` draws one warm-up frame of each view the session can reach, on both backends: flight with the effect meshes shown, map view in vessel and system scope, and site view. It does this after the existing work (compiles, the planet's full and half paths). `SceneModel.warmViews(draw)` saves the view state, draws, and puts it back. three builds what each view draws then, not on the first switch.
   - The progress gains a `warm` stage. The rest of the precompile (other presets' maps and vegetation) stays in the background as before.
4. **A loading screen until the first complete frame.** The layout covers the world pages that draw the 3D view with a loading page until the world renderer is ready. Ready means the warm-up is done and a frame has been drawn after it. The page lists its steps:
   - starting the world (sim boot);
   - starting the graphics (device);
   - compiling programs;
   - preparing views (the warm-up frames);
   - first frame.

   While it shows, the renderer draws in the holder even if no page holds it, so the warm-up runs on world entry from any page. There is no HUD over a black canvas any more.
5. **The Mission Center from Flight's map toggle** stays a client-side navigation (its URL, back button and links keep working). It no longer builds anything: the Mission Center takes the same renderer and canvas and switches to system scope on the next frame. Back to Flight is the same.

## Alternatives considered

- **One SvelteKit page with the three places as modes** — it would remove the page swap too, but it merges about 3,500 lines of three pages and their URLs and history. The renderer is what costs seconds. The page swap costs one Svelte mount.
- **Keep three renderers alive, one per page** — three devices and three copies of the terrain and textures in GPU memory, and each one still compiles on its first visit.
- **`compileAsync` for the map and site views instead of drawing them** — on WebGPU it does not carry over to the targets the frame draws into (plan 261). Hidden objects are skipped, and map lines are hidden outside map view.

## Consequences

- GPU memory for the world's renderer stays allocated while the player is in the Hangar or another page without the 3D view. The Hangar keeps its own renderer.
- Entering a world takes the warm-up time once, behind the loading screen, instead of at every switch.
- A page that wants the 3D view must use `worldRenderer.acquire` and must not dispose the renderer.
- The governor's render scale is per page: `acquire` puts it back to 1, and Flight's governor sets its own.
