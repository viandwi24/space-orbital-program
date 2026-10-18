# 111 — Vessel panel: Overview with group control, Parts with per-part actions

**Plan:** [plans/111-vessel-panel-group-and-part-control.md](../plans/111-vessel-panel-group-and-part-control.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0153](../decisions/0153-vessel-panel-controls-from-descriptors-group-clicks-and-part-highlight.md) (new), [0174](../decisions/0174-part-action-descriptors-calls-compact-snapshot-and-custom-groups.md), [0102](../decisions/0102-vessel-panel-part-actions-dock-panels-and-the-mission-center.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `lib/vessel-panel/vessel-model.ts` | `vesselView` (groups with members on the vessel and their state; parts with controls from `describeModule`, sorted by catalogue category then entity id), `groupCommand` (on → off, off → on, mixed → off), `controlCommand` (checked with `actionArgumentProblem`) |
| `lib/vessel-panel/VesselPanel.svelte` | Overview (a switch per group, mixed shown), Parts (switch, slider with unit, segmented mode, trigger button; disabled with the reason), Comms tab reserved for 115; hover or focus highlights the part |
| renderer | `Renderer.highlightPart(entity \| null)`: the VAB's select rim on one part, kept across part rebuilds |
| flight | the AppBar's Vessel button; the panel at the top right (in place of the dock below 1280 px); `Flight.highlightPart`; `loadContent` carries action groups |
| tests | `vessel-panel/vessel-model.test.ts` (2: a fixture mod's value action renders a slider and sends the new value, an out-of-range value is refused; the engines group is mixed with one engine on and one click turns both off, in a real sim), e2e `vessel-panel.e2e.ts` (the landing legs from the Parts tab) |

## What surprised me

- **The snapshot is compact.** It carries values and group states; labels, kinds and ranges come from each module's `describe` on the page, as the HUD already did for engine throttle.
- **The sim does not check a descriptor's `enabled` or range** for `action`; the panel checks with `actionArgumentProblem` before sending and shows the reason.
- **No stock module has a `value` or `mode` action yet**, so the slider and segmented controls are tested with a fixture mod.
- **The moon shot is heavier than the Legacy pad's 18 t**, so the e2e flies it with Shift+Launch (the direct path, ADR 0150).
