---
id: 301
title: "A part model viewer page for debugging (/dev/parts)"
status: done
owner: "part viewer session (Claude)"
depends: []
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 301 — A part model viewer page for debugging (/dev/parts)

## Goal

The owner asked for "a special page to view part models" ("bikin page khusus viewer models part"): open one part, or a row of parts, in a few seconds without loading the game or a world, and look at what the generator made: wireframe, attach nodes, the physics shape, detail presets, the deploy animation, articulation and effects, with the numbers beside it. A link (`/dev/parts?part=…&compare=…`) opens the same view again.

## Context

- Pattern: `apps/web/src/routes/dev/webgpu-spike/+page.svelte` (dev page, unlinked, renderer imported on mount).
- Content: `apps/web/src/lib/catalog.ts` (`loadContent`, `partShapesOf`), `apps/web/src/lib/editor/categories.ts` (`categoryOf`, `categoriesOf`, `sortParts`, `matchesQuery`), `apps/web/src/lib/mods/asset-models.ts` (`modelProviders`).
- Models: `packages/renderer/src/parts/factory.ts` (`PartModelFactory`, `PartModel.setState`, `visual.deploy`, `visual.articulation`, plume, puffs, lamp), `packages/renderer/src/presets.ts` (`detailOf`), `packages/renderer/src/backend.ts`, `packages/renderer/src/webgpu-compat.ts` and `tsl/twins.ts` (GLSL effects under WebGPU).
- ADRs: 0028 (part model contract), 0249 (renderer backends).

## Scope

**In:** `packages/renderer/src/part-viewer/` (a `PartViewer` class on either backend, with pure layout helpers), the `@orbital/renderer/part-viewer` export, `apps/web/src/lib/dev/part-viewer.ts` (query string, grouping, families), the `/dev/parts` page, unit tests for the pure parts, screenshots and the journal.
**Out:** editing parts in the viewer; picking or measuring with the mouse; a menu link (the page is for developers, like the WebGPU spike).

## Design notes

- The page loads content as the Hangar does (`loadContent()` after the root layout started the mod runtime) and lists every part, hidden debris pieces included (marked), grouped by catalogue category (`categoryOf`), searchable by title and id (`matchesQuery`).
- `PartViewer` owns its renderer: `WebGLRenderer` for `webgl`, three's `WebGPURenderer` for `webgpu` and `webgpu-fallback` (`forceWebGL`), chosen like every view (`rendererBackend()`: `?renderer=` first, then Settings). Under WebGPU the GLSL effect materials (plume) are swapped for their TSL twins per draw (`hideUnported` + `Twins`), as the flight renderer does.
- Parts are built by one `PartModelFactory` at the chosen preset's detail (`detailOf(PRESETS[p])`); a detail change builds a new factory, because the texture size belongs to the material library.
- Each part stands on the grid floor (its bounds' bottom at y = 0); a compare row puts them side by side by their widths with a gap (`rowLayout`).
- Module state is synthesised for the toggles: deploy writes `visual.deploy`'s flag (0..1) and jumps the animation there; articulation writes the field its mode reads (gimbal tilt, hinge angle, extend length, visible); firing writes `ignited`/`throttle` for the plume, a full array for the puffs and `on` for a lamp.
- Query string keys: `part`, `compare` (comma list), `detail`, `nodes`, `shape`, `wire`, `deploy`, `art`, `fire`, `bg`, `renderer` (read by `rendererBackend`). The page rewrites the address as the view changes, so the address is always a link to what is on screen.

## Steps

1. Pure helpers in apps/web (query parse/serialise, grouping, families) with vitest tests.
2. `PartViewer` in the renderer: backends, scene, camera, overlays, state, stats; pure layout helpers with bun tests.
3. `/dev/parts` page: list, canvas, toggles, compare, stats, address sync.
4. Lint, typecheck, web tests, renderer tests; screenshots; journal; docs.

## Acceptance criteria

- [x] `cd apps/web && CI=true bun run test` passes `src/lib/dev/part-viewer.test.ts` (query round trip, grouping by category, families); the two known failures in `sim-host-script-worker.test.ts` are the only failures.
- [x] `bun test packages/renderer/test/part-viewer.test.ts` passes (row layout, framing distance, node marker scale).
- [x] `bun run lint` and `bun run typecheck` pass.
- [x] `/dev/parts?part=stock.rcs-block&nodes=1` shows the part with its nodes; `compare=stock.rcs-block,stock.rcs-block-5,stock.rcs-pair,stock.rcs-linear,stock.rcs-cold-gas` shows the row with labels; a parachute at `deploy=1` shows its canopy open: screenshots in `docs/journal/assets/301-*`.
- [x] `bun run docs:check` passes.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, recent journal).
- [x] `docs/journal/301-part-model-viewer.md` written.
- [x] Affected `docs/architecture/*.md` updated to match what shipped.
- [x] New ADRs written for any decision made here, linked above (none expected: a dev page).
- [x] `docs/research/stack-versions.md` updated for anything looked up.

## Log

- 2026-10-21 — Plan written and started on the owner's request.
- 2026-10-21 — Done. `PartViewer` (WebGL, WebGPU, WebGPU's WebGL2 fallback), `/dev/parts` with list, compare row, overlays, drive sliders, stats and address sync. Renderer `part-viewer.test.ts` 5 pass, web `part-viewer.test.ts` 6 pass, web suite fails only the two known `sim-host-script-worker` tests; lint, typecheck, docs:check pass. Screenshots and commands in journal 301. No ADR (a dev page, no contract change); architecture overview gained a paragraph.
