# 0153 — Vessel panel: controls from descriptors in a stable order, what a group click does, the part highlight

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [111](../plans/111-vessel-panel-group-and-part-control.md)
**Builds on:** ADR 0174 (part action descriptors, groups, `action` and `action-group`), ADR 0102 (vessel panel), ADR 0107 (refs), ADR 0149 (dock and the right column on narrow screens)

## Context

The sim reports a vessel's action values and group states compactly (`VesselSnapshot.actions`); labels, kinds, ranges and reasons come from each module's `describe`. The panel must show Overview (groups) and Parts (each part's controls) without UI code per module, never reorder under the player's eyes, and point at the part in the 3D view.

## Decision

1. **Controls from descriptors.** The page calls `describeModule(module, config, view)` for each part module (as the HUD does for engines) and draws: `toggle` → switch, `value` → slider with min, max, step and unit, `mode` → segmented, `trigger` → button. A disabled descriptor shows the control disabled with its reason as the tooltip; a value the UI would send is checked with `actionArgumentProblem` first. A module whose `describe` throws shows no controls and the rest go on.
2. **Stable order.** Parts by category (the catalogue's order, ADR 0146), then by part entity id; controls by module order, then descriptor order. Values update in place; nothing reorders while the panel is open.
3. **Group clicks.** A group switch sends `action-group` with an explicit value: `on` → off, `off` → on, `mixed` → off (one press makes a mixed group consistent and safe).
4. **Placement.** The toolbar's Vessel button opens the panel at the top right on wide screens; below 1280 px it takes the right column instead of the dock while open (the dock returns when it closes). Tabs: Overview, Parts, Comms (reserved for plan 115, disabled with that note).
5. **Highlight.** `Renderer.highlightPart(entity | null)` puts the VAB's additive select rim on one part of any vessel; the panel sets it while a part row is hovered or focused and clears it on leave. It is drawn only for the part, never for the whole vessel.

## Consequences

- Renderer API addition `highlightPart`; `Flight.highlightPart`.
- `lib/vessel-panel/` (model and component); the AppBar's Vessel button works.
