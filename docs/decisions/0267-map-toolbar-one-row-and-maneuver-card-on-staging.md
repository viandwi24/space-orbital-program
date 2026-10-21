# 0267 — The map's filters and Regions in one row; the maneuver card on staging at the right

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/292-map-toolbar-one-row-and-compact-maneuver-card.md
**Supersedes in part:** ADR 0253 point 1 (the sentence "the node editor stays above the navball, where it is edited against the ball"), ADR 0223 (the node panel's full editor always shown)
**Builds on:** ADR 0205 (the region table), ADR 0242 (the map filter row), ADR 0180 (the Regions layer), ADR 0253 points 3 and 5 (inspectors at the top right, staging at the bottom right)

## Context

The owner's feedback on the flight map, 2026-10-21 (screenshot at about 760 px wide):

- The top centre held three rows: the Map | Mission Center switch, the filter row, and a "Regions" pill on its own row.
- The maneuver panel stood above the navball, in the middle of the view. With every field shown (status, five read-outs, three axis inputs, ten time buttons, four actions and a note) it was about 440 px tall and covered the vessel and the orbit the player was planning.

KSP and KSP2 keep the editing on the node itself (a gizmo on the orbit) and show a small card with the burn's numbers, with the rest a click away. Our map already has the node's drag handles and keys (plan 224), so the card only has to summarise and offer the controls.

## Decision

1. **Regions is a chip in the map filter row.** It is an icon button (`globe`, tooltip "Science regions") after the layer switches, before Vessels. `RegionsLayer` keeps only the label under the cursor. Below 1280 px the switch keeps its own row above the filters (plan 256): the toolbar under the bars is one row at every width.
2. **The maneuver card stands on staging**, in the right column (ADR 0253 point 5), 260 px wide like staging, in map and flight view alike. The column grows up from the bottom right (from above the navball module on narrow screens). When card and staging do not both fit, the card gives way three times as fast as staging (flex-shrink 3, never below its status line) and scrolls; staging's queue scrolls as before. With staging hidden, the card holds the column alone. Nothing of the node's UI stands over the middle of the view or above the navball any more. The part inspectors at the top right stop above the column, as they stopped above staging.
3. **The column stops under the map toolbar** where they would meet (a narrow window, a large UI scale). The page measures both boxes (`cornerTop` in `lib/layout/regions.ts`). A first try put the card at the top right, under the inspectors; at 900 px, with staging above the navball module, the space left between the bars and staging was about 80 px, so the card was cut.
4. **The card is a summary with the editor folded.** Always shown:
   - the status (Burn in / Burn now / Overdue);
   - the node's index with previous and next;
   - Δv, burn time, node in, planned Ap and Pe;
   - icon buttons with tooltips: warp to burn, point SAS (first node only), alarm, remove, and the editor's toggle.
   
   Folded behind the toggle (`aria-expanded`): the prograde, normal and radial fields, each with − and + steppers (1 m/s, Shift 10 m/s, arrow keys in the field), one time stepper (− / step / +, the step one of 1 s, 10 s, 1 min, 10 min or one orbit), and the impulsive-plan note. Whether the editor is open is kept for the session, so it survives leaving and re-entering map view.
5. **The card's buttons keep their size in drawer mode with a mouse.** Drawer mode's 44 px floor (ADR 0205 point 6) applies to the card only on a touch screen (`pointer: coarse`), where the card's own rule makes them 44 px too. At 900 × 760 the 44 px rows were what pushed the card and staging past the room above the navball module.
6. **The map's empty hint** ("click the orbit to plan a burn" with the node keys) uses the same place and width.

## Consequences

- The node is no longer edited "against the ball". Point SAS and the navball's maneuver marker still tie them together.
- Staging's queue shows fewer stages while a node exists on a short window; it scrolls, as it already did.
- e2e tests that type into the node fields open the editor first (`maneuver-expand`).
