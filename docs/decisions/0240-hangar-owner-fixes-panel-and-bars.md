# 0240 — The Hangar after the owner's test: a clear bay, the astronaut's gear out of the catalogue, a folding right panel, Flight's bars

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/255-hangar-owner-fixes.md
**Builds on:** ADR 0222 (the Base layout), ADR 0225 (the Hangar inspector), `refs/reverse-engineering-ksp-ksp2/02-vab-sph-editor.md` §9–10

## Context

The owner's hand test (`docs/reviews/2026-10-20-owner-manual-test.md`, items 1–5) found the service arms reaching into the bay, an EVA Suit and a Flag in the parts list, a long untidy right panel and a Hangar frame unlike Flight's.

## Decision

1. **The arms stay retracted.** Each tower keeps one short stub (`ARM_STUB`, 1.2 m) past every deck; nothing of the towers comes within 10 m of the vertical axis, whatever the vessel's size. `setVesselRadius` stays on the Hangar's interface and does nothing to the arms. The floodlights stay.
2. **The EVA Suit and the Flag are not catalogue parts** (`catalog.hidden`, as the fairing panel). KSP keeps them in the astronaut's inventory; here the suit is what a crew member becomes on EVA and the flag is planted from it, and both still load, fly and resolve. A crew inventory is a later feature; until then there is nothing to place in the Hangar. The ladder stays: it is built onto a hull.
3. **The right panel folds.** One header with six figures stays (mass, parts, height, Δv, TWR, cost) with stability under it, as KSP's Δv readout keeps the figures and folds the detail.
   - **Trip** is one line (`Low orbit (80 km): 3,343 of 3,343 m/s`, with a dot for covered, short or idle); the destination picker, meter, note and legs are under a chevron.
   - **Staging**, **Pre-flight checks**, **Power** and **Crew** are sections with a chevron. Staging and checks start open, the others folded. The state is remembered (`orbital.vab.folds`, a damaged value falls back per section).
   - Staging rows keep their height and share one grid (stage badge, chips, a fixed column of figures); the column scrolls instead of cutting a stage off.
   The sections and their defaults are data (`panel-model.ts`).
4. **The bars are Flight's.** The Hangar is an immersive page (`IMMERSIVE` gains `/vab`): the view fills the window and the bars float over it, with its panels 80 px below the top and 56 above the status bar. The actions are menu-bar icons with tooltips, like Flight's panel toggles: New, Open, Save and Launch (the main action, lit; Shift-click still flies at once). The test ids are unchanged. The paused chip's style is plan 256's.

## Consequences

The retracted arms are a plain stub, not a gantry that follows the vessel; a taller build is no longer "hugged" by the towers. Hiding the suit and flag means a mod's EVA parts opt in to the same flag. Four new menu icons join `SHELL_ICONS`.
