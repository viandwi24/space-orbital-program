---
id: 255
title: "Hangar fixes from the owner's test: a clear middle, no EVA items in the parts list, a compact right panel, the shell bars as in Flight"
status: done
owner: "Worker A"
depends: []
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 255 — Hangar fixes from the owner's test: a clear middle, no EVA items in the parts list, a compact right panel, the shell bars as in Flight

**Size:** L

## Goal

Fix the Hangar items 1–5 of `docs/reviews/2026-10-20-owner-manual-test.md` (screenshots `01`–`05` in `docs/reviews/assets/2026-10-20-owner-test/`).

## Context

- **Owner test, 2026-10-20,** on the Pages build of main.
- **Item 1, tower arms.** The diagonal tower arms come from plan 220: `packages/renderer/src/vab/hangar.ts:65-73` and the arms aimed at the axis near `setVesselRadius`. The owner wants a large free space in the middle; this was asked before (complaint C20).
- **Item 2, EVA Suit and Flag.**
  - Today: they are catalogue parts, in `mods/stock/src/eva.ts`.
  - KSP 1.11+: the flag and EVA items live in a kerbal's inventory or in cargo containers, not in the parts list. See `refs/reverse-engineering-ksp-ksp2/10-eva-kerbals-inventory.md`.
- **Item 3, right panel.**
  - The vessel stats, the Trip block (plan 218), staging and the checks are long and untidy.
  - KSP's Engineer's Report and Δv readout, and KSP2's VAB right panel, are described in `refs/reverse-engineering-ksp-ksp2/02-vab-sph-editor.md`.
- **Items 4–5, shell bars.**
  - The Hangar shows the menu-bar actions New / Open / Save / Launch as text without icons, inside a solid black container that the v2 design does not have.
  - The design references are `refs/space-orbital-program-ui-v2/` and `docs/BASE_LAYOUT.md`. The Flight page is the reference for how the bars look.
  - The paused chip style is plan 256's, so share the component, not two fixes.

## Scope

**In:**
- **Tower arms:** remove the arms, or retract them to the towers. Nothing reaches into the build area; the floodlights stay.
- **EVA Suit and Flag:** move them out of the Hangar catalogue into crew inventory. If no crew inventory exists, hide them from the catalogue and leave a follow-up. Check that EVA, flags and the lessons still work.
- **Right panel, compact:**
  - a stats header (mass, parts, height, Δv, TWR, cost);
  - Trip collapsed into one line with a details toggle, as KSP's Δv app does;
  - staging rows aligned on a grid;
  - collapsible sections with remembered state;
  - follow the KSP/KSP2 research.
- **Hangar bars:** the same bars as Flight, with no extra black container. New, Open, Save and Launch get icons and tooltips, following the v2 icon set.

**Out:** new features.

## Touches

`packages/renderer/src/vab/hangar.ts`, `mods/stock/src/eva.ts` (catalogue visibility), `apps/web/src/lib/vab/*`, `apps/web/src/lib/editor/*` (stats and staging), `apps/web/src/routes/(world)/vab/+page.svelte`, `apps/web/src/lib/layout/*`.

## Steps

1. Read the KSP/KSP2 refs and the v2 design. Write a short ADR for the right-panel layout and the EVA-items decision.
2. Implement items 1–5, each with a unit test where the logic allows:
   - the catalogue filter;
   - the panel model;
   - the arms' geometry bounds.
3. Take screenshots before and after at 1440 × 900 and add them to the journal.

## Acceptance criteria

- [x] No hangar geometry enters the build area in the middle; renderer test passes.
- [x] The catalogue has no EVA Suit or Flag. EVA and flag planting still work; tests pass.
- [x] The right panel is compact and collapsible. Screenshots are in the journal. `[manual]` The owner approves: waiting.
- [x] The Hangar bars match Flight; the actions have icons. `[manual]` The owner approves: waiting.
- [x] Affected unit tests and the typecheck pass. E2E is paused by the owner.

## Docs checklist

- [x] STATUS row.
- [x] Journal with screenshots.
- [x] ADR.

## Log

- 2026-10-20 — Created by the coordinator from the owner's manual test.
- 2026-10-20 — Worker A: ADR 0240. Arms retracted to stubs, EVA Suit and Flag hidden from the catalogue (no crew inventory exists: follow-up), a folding right panel with the trip as one line, the Hangar as an immersive page with icon actions in the menu bar. The paused chip is left to plan 256. Unit tests only (e2e paused by the owner).
