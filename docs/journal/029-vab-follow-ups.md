# 029 — UI: VAB follow-ups

**Plan:** plans/029-vab-follow-ups.md · **Session(s):** vab-2 session (Claude, 2026-10-17), with one renderer worker agent · **Date:** 2026-10-17 · **ADRs:** [0041](../decisions/0041-vessel-library-and-sub-assemblies.md), [0042](../decisions/0042-stability-read-out-centre-of-mass-and-pressure.md)

## What was done

The draft was refined to `ready` at the human's request (two ADRs, measurable criteria; mod-supplied categories, the trip planner and mod lifting modules pushed to draft 034, M1/M2 stays in 033) and implemented.

| Where | What |
|---|---|
| `apps/web/src/lib/vab/library.ts`, `library-idb.ts` | vessel library over a `LibraryStore` (memory store for tests, IndexedDB adapter, fallback to memory with a "not kept" notice); save, rename, duplicate, delete, import, export, damaged records listed; autosave 800 ms after an edit and on hiding the tab; `navigator.storage.persist()` asked after the first save |
| `lib/editor/assembly.ts`, `state.ts` | sub-assemblies: `assemblyFromSubtree`, `reindex`, `planAttachAssembly` (the one place copies are made, now for any assembly; corresponding parts of the copies share a group), `attachAssembly` |
| `lib/editor/state.ts` | group operations: `planCarry`, `moveGroup` (a radial symmetry group moves together, keeping relative angles), `setRadial` (angle and height of a part or its group, or the part alone), overlap check on the parent's surface |
| `lib/editor/stability.ts`, `checks.ts` | ADR 0042: CoM full and empty, CoP at 6 degrees angle of attack from fins and cross-flow drag, margin in calibres, state; check `unstable` (warning, only with fins) |
| `lib/editor/describe.ts` | spoken description of the stack and stages for screen readers (`aria-describedby` of the canvas) |
| `lib/editor/examples.ts` | the 23-part booster rocket built through editor operations (button "Load the booster rocket") |
| `lib/vab/controller.svelte.ts` | the page's state and behaviour (pointer, keyboard, library, derived read-outs) moved out of the route |
| `lib/vab/TopBar`, `SelectionCard`, `LibraryDialog`, `Catalogue` ("Sub-assemblies" tab), `StageEditor` (rendered thumbnails on chips), `StatsStrip` (stability) | components |
| `routes/vab/+page.svelte` | 1 294 lines to 424 (layout only); right column scrolls inside, Launch sticks to its foot; under 900 px the panels are drawers |
| `packages/renderer/src/vab/` (worker agent) | `part-layer.ts` instancing (`InstancedMesh` per definition, picking through the hidden source meshes, highlighted parts fall back to their own mesh), x-ray ghosts, `stability-markers.ts`, `setHighContrast`, `setReducedMotion`, `captureThumbnail`, hangar rebuilt with `hangar-light.ts` (daylight, shafts, time of day), `hangar-movers.ts` (crane, tug and trailer, 8 crew), `hangar-signs.ts` (sign atlas), `stats.vesselDrawCalls/vesselTriangles/instancedParts` |

## Verification

| Criterion | Evidence |
|---|---|
| Library logic | `apps/web/src/lib/vab/library.test.ts` (10 tests): save/update in place, newest first, thumbnail kept, rename (blank and unknown refused), duplicate under free names, delete, import (valid, bad JSON, bad schema, unresolvable part, nothing stored on failure), format 1 upgraded to 2, export round trip, damaged record listed, kinds separate, fallback to memory |
| Library UI `[manual]` | built-in browser: duplicate 11 to 12, rename, delete with confirmation back to 11, reload keeps 11 (IndexedDB), no "not kept" notice. `assets/029-library-1920x1080.png`, `assets/029-library-1280x720.png` |
| Sub-assemblies | `lib/editor/group.test.ts`: indices from 0, root link dropped, inner links and radial angles kept, lone group tags dropped, insertion at an axial target and at a radial target with symmetry 3 (two groups of three, unique indices), one undo step. `[manual]` a decoupler, its booster and cone kept (3 parts) and placed with symmetry 3: `assets/029-subassembly-preview-1920x1080.png`, `-placed-1920x1080.png`, `-preview-1280x720.png` |
| Group move and angle | `group.test.ts`: moving one member moves all four with the same relative angles and height, one undo step; "only this" leaves the group; turning the group by 0.3 rad, one undo step; single turn; refusals (height 5 m, overlap on the neighbour's angle, part without a radial link) leave the design unchanged; carry preview shows 8 ghosts (4 decouplers, 4 boosters). `[manual]` the booster group moved to the upper tank by one click: `assets/029-group-move-ghosts-1920x1080.png`; the angle slider turned the pack by 30 degrees |
| Ghosts `[manual]` | symmetry 4 armed over the tank: all four copies visible, the hidden ones through the vessel: `assets/029-symmetry-ghosts-1920x1080.png`, `-1280x720.png` |
| Stability | `lib/editor/stability.test.ts` (6): reference two-stage dry CoM -3.7794 m and CoP -3.5 m by hand (see the test), full-tank CoM -3.6555 m, state `unfinned`; four fins low on the lower tank: CoP below CoM, margin above 0; the same fins high on the upper tank: `unstable`; lower fins give a larger margin; check `unstable` warns only the unstable finned design. The booster rocket reads "Stable +1.1 cal". `[manual]` markers: `assets/029-stability-1280x720.png`, `-zoom-1920x1080.png` |
| Instancing | `packages/renderer/test/vab-instancing.test.ts`: the 23-part rocket's vessel graph (colour + shadow pass) is 82 draw calls and 47 264 triangles (budget 120 and 60 000); copies share one geometry and material; picking and highlight fallback; LOD rule. Numbers below |
| Hall `[manual]` | `assets/029-hall-1920x1080.png`, `-1280x720.png`: legible sign, striped walls, crane, tug with trailer, crew, daylight shafts; `low` keeps movers and drops lights, shafts, shadows and dust. Reduced motion: with `matchMedia` patched to report it and the page re-entered, two screenshots 4 s apart were identical (hook, crew and tug did not move) |
| Layout | check script (below) at 1920x1080, 1366x768, 1280x720 and 1024x768 with a symmetric part selected: no panel outside the viewport, no page scroll, Launch visible, nothing needed to scroll. At 800x600 the panels are drawers (`assets/029-narrow-800x600-drawer.png`); the stages drawer scrolls inside itself with Launch sticky |
| Controller | `routes/vab/+page.svelte` 424 lines (limit 700), guard test `routes/vab/page-size.test.ts`; `svelte-check` 0 errors |
| Accessibility | `describe.test.ts` (3); keys: `Ctrl+S` save, `M` / `Shift+M` move, `A` keep, `Q` `E` turn, `[` `]` cycle, all focusable controls; sliders have `aria-valuetext`; text uses the ADR 0026 tokens (contrast tested in `lib/ui/tokens.test.ts`); renderer test checks the high-contrast outline colours against the hangar at 4.5:1. In the browser only `A`, `M`, `Ctrl+Z` and `Escape` were pressed; `Q`/`E` and `Ctrl+S` were not pressed in the browser (the operations behind them are unit-tested) |
| Frame time | below |

### Layout check

`window.__lc()` (a short script run in the page, not committed): for `.top`, `.leftcol`, `.rightcol`, `.bottom`, `.launch`, `.checks`, `.stages`, the selection card and the catalogue it reports elements outside the viewport and elements that scroll inside. Result at 1920x1080, 1366x768, 1280x720, 1024x768: `offenders: []`, `scrolls: []`, `launchVisible: true`, `pageScroll: false`. Before the work the right panel was cut off below about 1000 px.

### Frame time and budget (booster rocket, 1440x900 CSS px, device ratio 2, Apple M5, built-in browser)

| | before (journal 026) | after `high` | after `low` |
|---|---|---|---|
| draw calls, whole frame | 280 | 179 | 93 |
| triangles, whole frame | 83 118 | 79 021 | 27 345 |
| vessel only (colour and shadow pass) | 206 calls / 62 432 | 85 / 47 749 | 36 / 9 309 |
| CPU ms per `renderFrame` (moving average) | 4.0 | 0.99 | 0.79 |

The hall now costs about 96 draw calls (it was about 74) because of the props. GPU time was not measured; M1/M2 and Intel are not measured (draft 033).

### Repo checks

`bun test packages/renderer`: 219 pass, 0 fail. `apps/web` vitest: 342 pass. `bun run typecheck`: 0 errors. `bun run build` ok. Full `bun test` (run before the last renderer tweak): 957 pass, 3 fail, none in my area: `packages/sim` determinism (100-part tower, plan 031 is editing the sim), `sim-host-script` warp test and `browser-support.test.ts` (plan 032, in progress). Prettier clean on my files.

## What surprised me

- Vite did not see another session's change to `packages/core` (my temporary config ignores that folder), which showed up as "does not provide an export named fbm3" and a 500; restarting the dev server fixed it twice.
- `$derived` class fields in `.svelte.ts` can reference methods only if those fields are initialised first (`defOf` had to move above the state).
- The built-in browser's pane was hidden twice mid-run (screenshots time out until it is shown again).
- High-contrast ghosts blew out under bloom (additive); the values were lowered after a screenshot.
- Screenshots: the browser tool returns images at most 800 px wide whatever the emulated viewport; the files named 1920x1080 and 1280x720 are captures of those emulated viewports, downscaled.

## Decisions made

ADR 0041 (library and sub-assemblies in IndexedDB), ADR 0042 (stability read-out). Not an ADR: group operations apply to radial groups only; a non-radial target moves the part alone (it leaves the group), as in plan 026.

## Self-review

Honest list of what is not release quality:

- **Hall**: much better (sign, crew, tug, crane, daylight), but the crane is only partly in view from the default camera, the walls are still dark, floodlights glare close up, crew and crate are low-poly. It is good, not final.
- **Stability markers**: the CoP glyph can be confused with the tank's yellow hazard decal and is small at 1080p; a legend sits under the read-out. The model is approximate (reference angle 6 degrees, only `stock.fin`, flat-plate cross-flow); it is a guide, not a flight result.
- **Library**: autosave creates a record per started vessel (loading the examples repeatedly fills the list; there is no limit, search or folders); thumbnails of tall rockets are thin in a 3:2 frame; no sorting choice; a damaged record is listed with its first error and can be deleted or exported, not repaired.
- **Group move** is for radial groups; groups of stacked parts and a drag handle in the 3D view are not done; the angle control is sliders and `Q` `E`, not a 3D handle.
- **Instancing**: the third copy of a definition switches all copies to a lower detail (a visible pop once).
- **Accessibility**: keyboard and screen-reader behaviour were checked by tests and a few keys in the browser, not with a real screen reader; reduced motion was tested with a patched `matchMedia`, not a real media emulation.
- **Not measured**: M1/M2, Intel GPUs, GPU time.
- **Narrow windows** (under 900 px): drawers work but are plain; no touch support.
- **Time of day**: renderer config exists, the page does not use it.

## For the next plan

- Draft 034 (mod categories, trip planner, mod lift modules) and 033 (device measurement).
- 023 (release): the hall pass above, library housekeeping, a real device matrix.
