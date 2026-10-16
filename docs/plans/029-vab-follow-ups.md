---
id: 029
title: "UI: VAB follow-ups (vessel library, sub-assemblies, symmetry editing, stability, hangar, instancing, layout)"
status: done
owner: "vab-2 session (Claude, 2026-10-17)"
depends: [022, 026]
phase: 3
created: 2026-10-16
updated: 2026-10-17
---

# 029 — UI: VAB follow-ups

## Goal

The VAB of plans 022 and 026 reaches the release bar of `product/visual-direction.md` (ADR 0025): several named designs live in the browser, a selected subtree can be kept as a sub-assembly, radial and symmetric placement is easy to see and to edit, an unstable finned design warns, the 23-part booster rocket draws cheaply, the hall is lit and alive, and no panel is cut off down to 1280x720 (with a narrower fallback).

## Context

- Read: `docs/journal/022-vab-3d.md` (self-review), `docs/journal/026-part-visual-follow-ups.md` ("For plan 029"), ADRs 0016, 0025, 0026, 0029, 0034, 0035; `docs/product/visual-direction.md`; `docs/research/vab-editor.md`.
- New ADRs: **0041** (library and sub-assemblies, IndexedDB) and **0042** (stability read-out).
- Hand-offs from plan 026: `AttachTarget.radial`; `planAttach` is the one place symmetric copies are made; a group is `parts[i].symmetry`; the library saves format 2 (`migrateVesselDesign` upgrades older files); an assembly's root is a normal part, its `radial` is in the parent link only; the "Aerodynamics" category comes from `ModuleFin` and `dragCoefficient` in `categories.ts`.
- Draft 033 listed a stability read-out and instancing of symmetric copies; both moved here (see its Log).

## Scope

**In:**
1. Vessel library (IndexedDB, thumbnails, open/save/rename/duplicate/delete/import/export), Open dialog replacing the file-picker button, autosave.
2. Sub-assemblies: save a selected subtree, place it from the catalogue (symmetry included).
3. Radial UX: all symmetric ghost copies visible through the vessel; moving a symmetric part moves its group (one undo step; "only this part" leaves the group); an angle control for the selected radial part or group.
4. Stability read-out (ADR 0042): centre of mass and pressure markers in the view, margin in the stats strip, a launch warning for an unstable finned design.
5. Instancing of symmetric copies in the renderer; a stated triangle and draw-call budget.
6. Hangar polish: legible lettering, varied walls, moving props (crane, a vehicle, workers), lighting variant per graphics preset.
7. Layout: right panel never cut off at 1280x720; a narrower fallback; the page controller extracted from `+page.svelte`.
8. Accessibility: a screen-reader description of the stack, reduced-motion path tested in the browser, a high-contrast marker option; stage chips show the rendered part thumbnails.
9. Frame time before/after on this machine, `low` path included.

**Pushed out (drafts, with reason):**
- Mod-supplied catalogue category and sort order: needs an SDK change and its own ADR (draft 034).
- Trip planner with more targets and simulated losses: needs a sim run per body (draft 034).
- Frame times on an Apple M1/M2 and an integrated Intel GPU: no such hardware in this environment; stays in draft 033 (item 7). Only the M5 and the `low` path are measured here.
- A mod's own lifting module in the stability read-out: needs a lift field in module descriptors (ADR 0033), draft 034.

**Out:** new part types, flight changes.

## Steps

1. Library logic, store interface, IndexedDB adapter, tests. Sub-assembly records and placement in the editor state, tests.
2. Group move, angle control, undo, tests.
3. Stability calculation and check, tests.
4. Renderer: instancing, x-ray ghost, markers, high-contrast option, hangar polish (budget test).
5. Page controller (`lib/vab/controller.svelte.ts`), components for the library dialog, toolbar, stats; responsive layout.
6. Accessibility pass; manual run in the browser; screenshots; frame times.
7. Docs, journal with self-review, STATUS.

## Acceptance criteria

Commands run from the repo root. `[manual]` ones need the built-in browser on a dev server and leave screenshots under `docs/journal/assets/029-*.png` (1920x1080 and 1280x720).

- [x] **Library logic**: `bun run --filter @orbital/web test` includes `lib/vab/library.test.ts` covering save, rename (unique names), duplicate, delete, import (valid, invalid JSON, schema failure, unresolvable parts, format 1 upgraded to format 2), export round trip, damaged records listed and not opened, store failure falls back to memory.
- [x] **Library UI** `[manual]`: Open dialog lists saved designs with thumbnails, open/duplicate/delete/rename/import/export work, the working design autosaves, reload restores the list (screenshot `029-library-*.png`).
- [x] **Sub-assemblies**: tests for saving a subtree (indices re-based, root link dropped, inner radial links kept), insertion at an axial and a radial target, with symmetry 3 (three copies, three groups), unique indices and undo as one step; `[manual]` a booster pack saved and placed twice (screenshot `029-subassembly-*.png`).
- [x] **Group move and angle**: tests that moving a member of a symmetry group moves all members to the matching angles with one undo step, that "only this part" leaves the group, that an angle change on a group rotates every member about its parent by the same delta and is undone in one step, and that a move that would collide or leave the parent's surface is refused with the design unchanged.
- [x] **Ghosts** `[manual]`: with symmetry 4 armed, all four ghost copies are visible at once, including those behind the vessel (screenshot `029-symmetry-ghosts-*.png`).
- [x] **Stability**: `lib/editor/stability.test.ts` gives CoM and CoP heights for known designs (hand-computed values in the test): the two-stage reference (unfinned), the booster rocket with four fins low on the core (stable, margin above 0), the same with the fins at the top (unstable, margin below 0 and the check `unstable` warns), and an unfinned design (state `unfinned`, no warning). `[manual]` markers and read-out visible (screenshot `029-stability-*.png`).
- [x] **Instancing**: `bun test packages/renderer` has a test building the 23-part booster rocket (two-stage example with 4 radial decouplers, 4 boosters, 4 nose cones, 4 fins) and asserting at most **120 draw calls** and at most **60 000 rendered triangles** in the VAB view model (before: 280 and 83 118), plus that symmetric copies share one geometry and material.
- [x] **Hall** `[manual]`: lettering legible from the default camera, wall variation, a moving crane, a vehicle and workers, `high` and `low` lighting variants (screenshots `029-hall-*.png`); reduced motion stops the movers (checked in the browser with the media feature emulated).
- [x] **Layout** `[manual]` plus a DOM check: at 1920x1080, 1366x768, 1280x720 and 1024x768 the right panel, the stage list, the checks and the Launch button are fully visible or scroll inside their panel; no element extends past the viewport (the check script's output in the journal).
- [x] **Controller**: `routes/vab/+page.svelte` is at most **700 lines** (from 1 294) with pointer, keyboard and action handling in `lib/vab/controller.svelte.ts` and presentational components; `bun run typecheck` has 0 errors.
- [x] **Accessibility**: a tested `describeStack` function ("Pod, wheel, tank, engine ..."), exposed to screen readers; keyboard reaches the library, sub-assembly, angle and group-move commands; high-contrast markers option; contrast of new text and controls at least 4.5:1 (ADR 0026 tokens, computed in the journal).
- [x] **Frame time**: VAB CPU ms per frame and draw calls/triangles for the 23-part rocket at 1440x900 ratio 2, before (journal 026: 83 118 / 280 / 4.0 ms) and after, `high` and `low`, in the journal.
- [x] **Self-review** written in the journal, honest about what is not at release quality.
- [x] `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check`, `bun run --filter @orbital/web test`, prettier check on the changed files all pass.

## Docs checklist

- [x] `docs/STATUS.md`, journal `029-vab-follow-ups.md`, ADRs 0041 and 0042, `docs/research/vab-editor.md`, `docs/architecture/overview.md` (VAB section), draft plan 034 with its board row, plan 033 Log note.

## Log

- 2026-10-16 — Created as draft from the plan 022 self-review.
- 2026-10-17 — Refined draft → ready at the human's request (session: vab-2 session). Criteria made measurable; trip planner, mod categories, mod lift modules pushed to draft 034 (SDK/sim work), M1/M2 stays in 033 (no hardware here).
- 2026-10-17 — Started (vab-2 session).
- 2026-10-17 — Done (vab-2 session). Evidence in `docs/journal/029-vab-follow-ups.md`. Deviations: screenshots are 800 px wide captures of emulated 1920x1080 and 1280x720 viewports; renderer triangle budget is counted for the vessel graph (colour plus shadow pass), whole-frame numbers are in the journal; draft 034 holds the pushed-out items.
