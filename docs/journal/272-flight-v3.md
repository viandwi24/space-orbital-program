# 272 — Flight v3: one dock, the compact navball module, staging on the right

**Plan:** [plans/272-flight-v3-one-dock-navball-module-staging-right.md](../plans/272-flight-v3-one-dock-navball-module-staging-right.md) · **ADR:** [0253](../decisions/0253-flight-v3-one-dock-staging-right-status-strip.md) · **Session:** ui-v3 session (Claude, M5), 2026-10-21, in its own worktree on branch `ui/272-v3`

## What the design asked for

The owner's v3 package (`refs/space-orbital-program-ui-v3`, now in git) has three Flight changes the owner named:
- the vessel panel merged into the "+" dock;
- a new navball;
- staging on the right.

Reading `FlightV3.dc.html` and `V3_CHANGES.md` against the code found more. All twenty differences are listed in the plan's diff table; this plan did rows 1 to 10.

## What was done

| Where | What |
|---|---|
| `dock/dock-model.ts` | Rail groups Vessel · Flight · Plugins (`railGroups`, `groupOf`). New host entries `host.vessel`, `host.parts`, `host.comms`, `host.crew`. A saved pre-v3 choice gets them once (`migrateDock`, the choice carries `v: 3`) |
| `dock/Dock.svelte` | Rail and panel are one glass box (radius 16). Rules sit between groups. The panel is 272 px wide and at most 860 px tall, with a v3 header (9/700 caps, the aside as a sub-title) and a close button. The resize grip moved to the box's edge |
| `vessel-panel/VesselPanel.svelte` | `tab` and `bare` props: the dock picks the tab and hides the panel's own tab strip. The title is the tab's name |
| flight page | Removed: the vessel panel column, its grip and toggle, the crew panel at the bottom right and its toggle. Crew is a dock entry and opens itself on EVA. Resources is the vessel panel's Resources tab (totals, containers, transfer). The menu bar is Panels · Navball · Staging · Camera. Part inspectors stand at the top right, above staging |
| `hud/InstrumentDeck.svelte` | The 552 × 232 module: body rect and ball bezel, VEL/ALT on the left wing, V/S arc left of the ball, a throttle arc right of the ball (grey when uncontrolled), the SAS pod, and the status strip |
| `hud/SasButtons.svelte` | The pod: hold in the centre and six modes on a ring of radius 44, with the pills above. Our three extra modes sit on the diagonals |
| `hud/status-chips.ts`, `StatusStrip.svelte` | The conditions as chips: UNCONTROLLED (red), NO POWER, NO SIGNAL, PLASMA BLACKOUT and RANGE (amber). A chip opens a popover with the cause and a fix (Open Parts, Open Comms). "All systems nominal" when there are none. The old badges' test ids and wording are kept |
| `hud/StageStack.svelte` | At the bottom right, 260 wide, growing up. Each row has its number, icons, parts in words, Δv and TWR. Then the NEXT block, GO and the total. The `Δv · Here` chip replaces the select |
| `layout/regions.ts` | The `vessel` region is gone; dock 260–272–400, navball 552 × 232, staging 260. `layoutFor(width, scale)` now returns only the mode |
| flight CSS | The dock reaches down to the safe area, unless it would meet the module (narrow, or a wide dock: `dock-meets-deck`, measured). Below 1280 px staging stands above the module |

## Screens

All screenshots are Chromium through `e2e/v3-screens.e2e.ts` (pictures on request only, `SHOTS_DIR`). "Before" is the base commit `d03c7ff6` in its own worktree; "after" is this branch. Both show the two-stage example on the pad with the first-flight guide on.

- 1440 × 900: `assets/272-flight-before-1440.jpg` → `assets/272-flight-after-1440.jpg`
- 1280 × 800: `assets/272-flight-before-1280.jpg` → `assets/272-flight-after-1280.jpg`
- 1024 × 768 (drawers): `assets/272-flight-before-1024.jpg` → `assets/272-flight-after-1024.jpg`
- The NO SIGNAL chip's popover: `assets/272-flight-chip.jpg`
- The dock's Parts entry: `assets/272-flight-parts.jpg`

The design is checked by its inline styles, not by a rendered frame: the `.dc.html` files need Claude Design's runtime, which is not in the package. The numbers are in the plan's diff table and in the CSS comments that cite V3 §2.

## Checks

- `CI=true bunx vitest run` in `apps/web`: everything passes except two tests in `sim-host-script-worker.test.ts` ("runs a script end to end in another thread", "a QuickJS builtin … is stopped by terminating the Worker"). They fail the same way on the base commit `d03c7ff6` in a clean worktree, so they are not from this plan (plan 268's journal saw the same). New: `status-chips.test.ts`, the dock groups and migration in `dock.test.ts`, and `regions.test.ts` rewritten for the v3 table.
- e2e (Chromium against the dev server): see the plan's Log for the run.

## Surprises

- `container-type`, `hidden` and `display: flex`: a tab strip with `display: flex` ignores the `hidden` attribute, so `.tabs[hidden]` needs its own rule.
- The dock's rail used `align-self: flex-start`, so at 1024 × 768 it ran out of the box under the guide card. It now stretches and scrolls.
- Text has a 10 px floor (ADR 0205), but the module's geometry shrinks on short screens (ball 144). The left wing's readouts and the V/S label were moved apart so they do not meet at 80 %.

## Open

Draft [274](../plans/274-v3-design-leftovers.md) covers the toasts, the chip flash, the Orbit panel restyle, the demolish tint and the menu bar's Overview hook.

The status bar at 1024 px lets "On the pad, ready to launch" run into Funds. It does the same before this plan, so it is not from this change.
