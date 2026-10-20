# 0241 — Flight UI after the owner's test: a collapsed vessel panel, a dock rail of its own height, one pause badge, clearances that follow what is shown

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/256-flight-ui-owner-fixes.md
**Builds on:** ADR 0153 (the vessel panel), ADR 0205 point 7 (view insets), ADR 0222 (the Base layout), `refs/reverse-engineering-ksp-ksp2/03-part-control-and-tweakables.md`

## Context

The owner's hand test (`docs/reviews/2026-10-20-owner-manual-test.md`, items 4, 6, 7, 8, 17, 19) found the vessel panel a wall of expanded parts with tall text buttons, the dock's tab rail stretching with a tall panel, the camera's anchor moving up when the navball was hidden, the place-pause chip drawn as odd outlined text and the map's tabs off the bars' row.

## Decision

1. **The Parts tab is an accordion.** KSP's Part Action Window opens one part at a time and KSP2's parts manager lists them collapsed; here every part is one line: a chevron, the name, one line of what matters (`partSummary`: the heat while it is above half its limit, else its fullest store as a percentage and how many more it has, else its first readout, else the number of controls), and icon buttons on the right with tooltips (Control from here, lit while it is; Inspect). The controls, stores and readouts are under the chevron. Categories are foldable headings with a count. What the player opens is remembered per vessel for as long as the page lives (entities do not outlast a load). Triggers sit side by side as small buttons and rows are 32 px on a pointer device (44 px on touch).
2. **The dock's rail has the height of its tabs.** It no longer stretches to the open panel; it scrolls only where the left stack is shorter than the tabs.
3. **The camera's clearances ignore what is hidden.** `viewInsets` (pure, `layout-model.ts`) counts a bar, the deck or a side panel only when its box has a size. The navball module hides its deck with `display: none`, which measures as an empty box at the origin and had counted as a deck reaching the whole screen height, pushing the vessel up; now hiding it frees the space and the vessel moves down into it. The insets are measured again when the navball toggles.
4. **One badge.** The clock's chip for every state (`PAUSED`, `PAUSED · HANGAR`, `PAUSED · MENU`, `LOCKED`, `BACKGROUND`) is the same chip; where it can lift the place pause it is a button reset to look like the plain one (it had the browser's outlined button), with a hover and a focus ring.
5. **The map's tabs stand on the bars' row.** In the map view, from 1280 px wide, `Map | Mission Center` is centred between the time bar and the menu bar at their height; narrower, they stay on the row below. The Mission Center page keeps its own switch inside its frame (see the journal).

## Consequences

Seeing a part's controls costs a click, as in KSP. The open rows are not saved between sessions. Narrow windows keep the older position of the map tabs.
