---
id: 293
title: "Flight map: no crash on escape burns, no text selection on drags, SOI on demand, steady orbit lines"
status: done
owner: "map crash + jitter session"
depends: [044, 045, 224, 258]
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 293 — Flight map: no crash on escape burns, no text selection on drags, SOI on demand, steady orbit lines

**Size:** M

## Goal

The owner hit four problems in the flight map on the deployed build:

1. Editing a large burn crashed the game with "propagateUniversal: universal Kepler equation did not converge (dt = 50740.92485174809 s, α = −6.236880549521935e-7 1/m)". The burn was prograde 1119.9 m/s and radial −750.9 m/s, planned Ap "escape".
2. Drags selected page text: the Ap/Pe/AN/DN labels and the top bar were highlighted blue.
3. The sphere-of-influence wireframe globes confused the player.
4. Orbit lines twitched while a node was edited or time was warped.

When this plan is done, that burn plans without a crash, drags select nothing, the spheres are an option that is off by default, and the lines hold still.

## Context

- `packages/kepler/src/propagate.ts` (`propagateUniversal`), `patched.ts` (`predictPatchedConics`).
- `apps/web/src/lib/map-path.ts` and `maneuver-controller.ts` (plan 045, 224), and `nav-markers.ts`.
- `packages/renderer/src/scene.ts`: `placeBodyMarks`, `placePath`, `setMapLayers`.
- `apps/web/src/lib/map/map-filters.ts` (plan 258, ADR 0242).
- Plan 292 (another session) owns the maneuver panel's layout and the map toolbar's Regions button. This plan owns the behaviour bugs only.
- ADR 0266 (written for this plan).

## Scope

**In:**

- the solver;
- graceful prediction when the solver fails;
- `user-select` on the map canvas and layers;
- the handle arm length;
- the SOI filter layer (default off, remembered);
- path frames and stable sampling;
- tests;
- a browser check.

**Out:** the maneuver panel's size and position, and the hint box's place on screen (plan 292).

## Steps

1. Reproduce the crash in a script. Fix the χ solve: a hyperbolic first guess, and a safeguarded Newton step that bisects when Newton does not halve the step. Raise the iteration cap.
2. Catch `KeplerError` in the patched-conic crossing search, in the map path sampling, in the maneuver controller's prediction, and in the apsis and plane-node markers.
3. Add `user-select: none` to the canvas and the map layers. Size the node handles' arm by the node's distance from its own body.
4. Add the `soi` map filter layer (default off) and `setMapLayers({ spheres })` in the renderer. Gate the body spheres and the encounter ghosts on it. Add a switch in the filter bar.
5. Draw path stretches in the frames of ADR 0266 and sample them on a fixed time grid.
6. Run tests, lint and typecheck, check in the browser, write the docs.

## Acceptance criteria

- [x] `propagateUniversal` converges for the owner's numbers (test with dt = 50740.92485174809 s and α = −6.236880549521935e-7 1/m, both directions, four periapsis radii). The result agrees with element propagation to 1e-9.
- [x] 2 000 random long hyperbolic and near-parabolic steps converge (test).
- [x] An unconverged step ends a path segment; no `KeplerError` reaches the page from the map.
- [x] A drag on the map canvas or a node selects no text (browser).
- [x] The spheres of influence are off by default, a switch shows them, and the choice is remembered (test and browser).
- [x] A planned stretch around the home planet is drawn at the planet now (test). The path's interior points do not move between two predictions (test). The lines hold still while a node is dragged and at several warp rates (browser).
- [x] `bun run lint`, `bun run typecheck`, `bun run test`, and `CI=true` vitest in `apps/web` pass.

## Docs checklist

- [x] ADR 0266, plan, STATUS row and journal entry.

## Log

- 2026-10-21: Created by the map crash + jitter session (started from the main session for the owner's screenshots).
- 2026-10-21: Done. Evidence in journal 293. After merging origin/main (plans 288, 292), all under the heavy-job lock:
  - `bun run lint`: exit 0.
  - `bun run typecheck`: exit 0 (svelte-check 0 errors).
  - `CI=true bunx vitest run` in `apps/web`: 1362 pass, 2 fail. Both failures are in `sim-host-script-worker.test.ts` (the real QuickJS thread times out). They fail the same way in the owner's untouched checkout at ad5777d8, so they are not from this plan.
  - `bun run test`: 2087 pass, 2 fail. The failures were two 3 600-day `career-bot` runs that hit the 90 s timeout on the loaded machine (300 s and 1 690 s of wall time). Run alone, they pass (see the next entry). Before the merge, `bun run test` passed 2089 of 2089.
  - The trajectory goldens were regenerated (new sampling grid, `frame`, `times`).
- 2026-10-21: `bun test --timeout 300000 packages/sim/test/career-bot.test.ts` run alone after the merge: 9 pass, 0 fail (135.8 s).
