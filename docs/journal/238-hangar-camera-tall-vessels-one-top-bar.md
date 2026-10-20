# 238 — Hangar: the camera reaches the top of a tall vessel; one top bar

**Plan:** [plans/238-hangar-camera-tall-vessels-one-top-bar.md](../plans/238-hangar-camera-tall-vessels-one-top-bar.md) · **Session:** Worker A, 2026-10-20 · **ADRs:** 0222 point 1 (one menu bar), 0207 point 4 (the turntable) · **Source:** release audit C3, C15

## What was done

| Where | What |
|---|---|
| `packages/renderer/src/vab/orbit-camera.ts` | `limitsForVessel(top)`: `panTop` is the vessel's top plus `PAN_TOP_MARGIN` (2 m), at least `PAN_TOP_MIN` (6 m) |
| `packages/renderer/src/vab/view.ts` | the view keeps those limits from the main group's height on every scene and passes them to the wheel, focus, pan, orbit and zoom; a target above a lowered ceiling comes down; `cameraGoal` for tests |
| `apps/web/src/lib/vab` | `TopBar.svelte` removed; `VesselName.svelte` (name, Aircraft, save status) at the top of the left column; `BuildContext.svelte` (the placing chip and notices) floats over the view; the tool pill gains Contrast and, on narrow windows, the two drawer buttons; the tool pill compacts against its own column (container query) |
| `routes/(world)/vab/+page.svelte` | grid without a top row; the menu bar's Launch is named "Launch", carries the old button's blocked state and its warning tooltip, Shift still flies at once |
| `ControlRows.svelte` | an accepted typed value is written back in its unit at once |
| e2e | `hangar-tall.e2e.ts` (a 50 m stack climbed by the wheel, one menu bar, the old bar's actions reachable, the pill clear of the right column); `trip.e2e.ts` uses the menu bar's New; `hangar-inspector.e2e.ts` types 60 on the LB-1 boosters |

## Where the old bar's things went

| Old top bar | Now |
|---|---|
| Back to the main menu | the shell's menu bar (Space Center, the menu) |
| Vessel name, Aircraft | top of the left column, above the catalogue (Hangar.dc.html keeps them top-left) |
| New, Open, Save | the menu bar's page actions (plan 204) |
| "Saving… / Saved" | beside the name |
| Launch, its tooltip and blocked state | the menu bar's Launch |
| Placing hints, refusals | a chip over the top of the view |
| High-contrast markers | the tool pill (Contrast) |
| Parts / Stages drawers (narrow) | the tool pill under 900 px |

## What surprised me

- **The Hangar e2e failures in the release run were real.**
  - The moon shot's LB-1 boosters now start at a 50 % limiter. Typing "50" committed the same value, so no prop changed and the field kept the raw "50".
  - At 1440 px the tool pill, grown by the plan 217 chips, was wider than the middle column. It covered the right column's foot, where the group editor's checkbox sits, and a click there landed on Redo. The window-width breakpoint (1279 px) could not see this; the column's width can.
- **The menu bar's Launch was labelled "Go to the launch screen"**, so every e2e that clicked `/^Launch/` used the Hangar's own button. With one bar the menu button is named Launch, and its tooltip says where it goes.

## Decisions made (link ADRs)

- None new: BASE_LAYOUT gives the page one menu bar (ADR 0222 point 1). The name moved into the content area, its first place below the bars.
