# 0253 — Flight v3: one dock that holds the vessel panel, staging on the right, a status strip under the navball

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/272-flight-v3-one-dock-navball-module-staging-right.md
**Supersedes in part:** ADR 0205 points 1, 5 and 6 (the vessel region, staging under the left stack, two side panels from 1440 px), ADR 0153 point 4 (the vessel panel at the top right), ADR 0144 point 5 (the toolbar's Crew toggle)
**Builds on:** ADR 0149 point 6 (the dock), ADR 0214 (uncontrolled), ADR 0158 (the link badge); design `refs/space-orbital-program-ui-v3` (V3_CHANGES §2)

## Context

The owner's v3 design package tidies the Flight HUD. The vessel panel at the right and the dock at the left both held information about the vessel. Staging sat under the dock. The uncontrolled, link and range pills stacked at the top centre, each in its own style. The navball module, SAS, throttle and readouts read as separate objects. The owner asked for three things: the vessel panel merged with the dock (the "+" panel), the new navball, and staging on the right.

## Decision

1. **One dock, at the left, at every width.** The rail is grouped, with a thin rule between groups:
   - **Vessel:** Overview · Parts · Comms · Crew. These are the vessel panel's tabs as rail entries `host.vessel`, `host.parts`, `host.comms`, `host.crew`.
   - **Flight:** Orbit · Resources · Target · Missions. Resources is the vessel panel's Resources content (totals, containers, transfer), which replaces the old totals-only panel.
   - **Plugins:** Script and every mod panel.
   - Then `+` (the panel library).

   One panel is open at a time. Clicking the open entry closes it. Rail and panel are one glass box (radius 16). The panel is 272 px wide by default (the dock span, 260–400, and its resize grip stay). It grows with its content to 860 px, then scrolls. The design's Maneuver entry is not a rail entry: the node editor stays above the navball, where it is edited against the ball (plan 045). Science stays a mod panel.
2. **Old dock choices migrate.** A saved `dock` choice gets the Vessel group's entries, in order, if it lacks them. `host.resources` keeps its id.
3. **The vessel panel is no longer a region.** Its column at the right, its resize grip, its menu-bar toggle and the bottom-right crew panel are removed. The part inspectors stand at the top right, above staging.
4. **The menu bar's Flight actions are Panels · Navball · Staging · Camera.** A white icon means shown and gray means hidden. The dot is kept only for the current page in the fixed group (V3 §2.1).
5. **Staging** stands at the bottom right (right 24, bottom 56, 260 wide). Its stage list scrolls, and the box grows upward to the top of the safe area (80). On a narrow screen (one-panel mode, below 1280 px at 100 %), it stands above the navball module on the right, as it stood on the left before. On EVA the Crew entry opens by itself, so the EVA controls show.
6. **The navball module** is the design's 552 × 232 box, scaled by `--k` (ball 180 px at 1, 144 px on short screens), centred on the ball. It holds:
   - the readouts on the left;
   - the V/S arc left of the ball;
   - the throttle arc right of the ball;
   - the SAS pod on the right, on a ring of radius 44. Our three extra modes (maneuver, target, anti-target) sit on the ring's outer diagonals.
7. **Conditions go in a status strip** under the module. UNCONTROLLED is red. NO POWER, NO SIGNAL, PLASMA and RANGE are amber. Each chip is a button that opens a popover with the cause and, where one exists, a fix (Open Parts, Open Comms). With no condition, the strip reads "All systems nominal". Events stay toasts. The chips keep the old test ids (`hud-uncontrolled`, `hud-link`, `hud-range`) and their reason text for assistive technology.
8. **The region table (ADR 0205 points 5 and 6), revised:**
   - `vessel` is gone;
   - `staging` is 260 wide;
   - the breakpoints keep their numbers;
   - "two" and "one" now differ only in where staging stands (bottom right, or above the deck on the right);
   - drawers (≤ 1024) keep their 44 px targets.

## Alternatives considered

- **Keeping the vessel panel as a second dock column** (the design's comment mentions "pinned + current"). Rejected: the design's own behaviour shows one column, and two columns at 1280 px would cover the navball.
- **Moving the dock to the right on narrow screens** (as before). Rejected: staging now owns the right side.
- **Drawing the status strip in a new component outside the module.** Rejected: the design ties it to the module's bottom edge. When the navball is hidden, the strip stays on its own at the module's place.

## Consequences

- The e2e tests that pressed "Vessel panel" open the dock's Vessel entries (`dock-tab-host.vessel`, and `vessel-tab-parts` / `-resources` / `-comms` on the rail).
- `settings.ui.panelWidth` is no longer read.
- The crew panel's tests open the Crew entry first.
