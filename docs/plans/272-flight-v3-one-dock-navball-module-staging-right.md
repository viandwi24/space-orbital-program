---
id: 272
title: "Flight v3: one dock with the vessel panel inside, the compact navball module with status chips, staging on the right"
status: in-progress
owner: "ui-v3 session (Claude, 2026-10-21)"
depends: [233, 268]
phase: 7
created: 2026-10-21
updated: 2026-10-21
---

# 272 — Flight v3: one dock, the compact navball module, staging on the right

## Goal

The Flight page looks as `refs/space-orbital-program-ui-v3/source/v3/FlightV3.dc.html` draws it:

- one dock at the left whose grouped rail holds the vessel panel's tabs and the crew;
- the 552 × 232 navball module, with its readouts, arcs, SAS pod and status strip;
- staging at the bottom right, growing upward.

## Context

- **Owner, 2026-10-21:** "v3: the vessel panel is merged with the add panel; the navball has a new design; the staging panel moves to the right."
- **Design:**
  - `refs/space-orbital-program-ui-v3/docs/V3_CHANGES.md` §2;
  - `README.md` and `CHANGELOG.md` (v3);
  - `tokens/tokens.css` and `tokens/tokens.json`;
  - `source/v3/FlightV3.dc.html`, whose inline styles are the spec.
- **Code:**
  - `apps/web/src/routes/(world)/flight/+page.svelte`
  - `lib/hud/InstrumentDeck.svelte`, `SasButtons.svelte`, `StageStack.svelte`, `CrewPanel.svelte`
  - `lib/dock/Dock.svelte` and `dock-model.ts`
  - `lib/vessel-panel/VesselPanel.svelte`
  - `lib/layout/regions.ts` and `layout-model.ts`
- **ADRs:**
  - 0205 (the region table): superseded in part by 0253;
  - 0149 point 6 (dock);
  - 0153 (vessel panel);
  - 0144 (navball module);
  - 0214 (uncontrolled).
- **New ADR:** [0253](../decisions/0253-flight-v3-one-dock-staging-right-status-strip.md).

## The diff: v3 against the app before this plan

The app followed v2 (plan 233). The differences found by reading `FlightV3.dc.html`, `SpaceCenterV3.dc.html` and V3_CHANGES against the code. The **Plan** column says where each one is done:
- **272** = this plan;
- **273** = the Space Center plan;
- **draft 274** = left for later;
- **same** = already matches.

| # | Screen | v3 says | The app before | Plan |
|---|---|---|---|---|
| 1 | Flight | One dock at the left. The rail is grouped: **Vessel** (Overview · Parts · Comms · Crew), **Flight** (Orbit · Resources · Maneuver · Science), **Plugins** (Scripts · plugin panels), then `+`. The groups have thin rules between them | A rail of host and mod panels in one list, plus a separate vessel panel at the top right with its own tabs (Overview, Parts, Resources, Comms) | 272 |
| 2 | Flight | Rail and panel are **one glass box**, radius 16. The rail has a padding of 4, the panel is 272 wide with a left border of `rgba(255,255,255,0.07)`. The header is 9/700 caps with a sub-title and a close ×. The panel grows to 860 max, then scrolls | The rail is a separate pill, and the panel is a separate card beside it with a gap of 8 | 272 |
| 3 | Flight | The vessel-info panel at the right, the Crew capsule at the bottom right, and their menu-bar toggles are removed | Vessel panel top right with a resize grip; crew panel at the bottom right; toggles "Vessel panel" and "Crew panel" | 272 |
| 4 | Flight | Menu-bar page actions: Panels · Navball · Staging · Camera. A white icon means shown, gray means hidden, and only the current page has a dot | Panels · Vessel info · Navball · Crew · Camera, with dots on the toggles | 272 |
| 5 | Flight | Staging at the **bottom right** (right 24, bottom 56, width 260, padding 10, radius 16). It grows upward to `top: 80` and its list scrolls. Each row: number · part icons · names · Δv · TWR. Then the NEXT block (badge, Δv, TWR, Burn), then GO + Total Δv. A `Δv · Here` chip replaces the view dropdown | Bottom left, 220 wide; the view is a select | 272 |
| 6 | Flight | Navball module 552 × 232, solid `#141518`, drop shadow, centred, its bottom at the safe-area line. Body rect at top 88, h 144, radius 20. Ball bezel 204 at (178, −4). Heading chip 48 wide at (256, −14) | Module 390/430 × 262: bezel circle, a bottom rect under the ball, the pod at the lower right, readouts under the ball | 272 |
| 7 | Flight | Ball 180 at (190, 8). V/S arc on the left of the ball (r 96, track `rgba(255,255,255,0.12)`, white level tick), "V/S 0.0" under it at (160, 170). **Throttle arc on the right**, filled from the bottom, accent when powered and `#5B5D63` without power, with "THR 37%" under it at (350, 166) | V/S arc left; throttle a vertical bar at the far left | 272 |
| 8 | Flight | Left wing: VEL and ALT at 15/500 with units 9 and the ORB/SEA chips, at (18, 118), 150 wide, gap 16 | VEL/ALT 13 under the ball with a rule between | 272 |
| 9 | Flight | SAS pod: a round 136 at (400, 60). Stability in the centre, 6 modes on a ring of radius 44 (pro up, retro down, normal and radial-out right, anti-normal and radial-in left). Buttons are 32 round, `#24262A`, active in accent. The SAS/RCS pills sit above the pod at (412, 22), 112 wide. **Uncontrolled:** dim `#4A4B50`, `not-allowed` | Pod at (250, 124), 132; pills over it; our 3 extra modes (maneuver, target, anti-target) in a column | 272 (the extra modes sit on the ring's outer corners) |
| 10 | Flight | **Status strip** under the module: a rule at y 202, chips 20 high, 8/700 caps, a 5 px dot. UNCONTROLLED in red `#FF8A8E`; NO POWER and NO SIGNAL in amber `#FFB86B`; "All systems nominal" with a green dot when none apply. A chip opens a popover (cause + a fix button: Open Parts / Open Comms). A failed action flashes its chip for 1.2 s | Separate pills at the top centre: Uncontrolled, link, range, blackout | 272 (flash: draft 274) |
| 11 | Flight | Toasts at the top centre, top 24, 380 wide: at most 2, a 28 px icon tile, title 12/600, body 10, a dismiss ×, and repeats merged into `×n` | Up to 4, no dismiss, no merge | draft 274 |
| 12 | Flight | Orbit panel: one right-aligned value column, the time as sub-text, warp as an icon at the end of the Ap/Pe rows, no dashed underlines | Outline warp buttons, dashed term underlines | draft 274 |
| 13 | Flight | Status bar shows the vessel's link (`No signal · Occluded by Earth`) | Shows the network | same (plan 233 already shows the focused vessel's link) |
| 14 | Flight | Time bar: segments above the limit are hatched; "catch up" is an icon | Hatched locked segments and the catch-up control exist | same |
| 15 | Space Center | Three modes, Overview → Build → Focus. A **context bar** at the bottom centre (bottom 52) changes per mode | A right column with every panel at once, and a build dock at the bottom | 273 |
| 16 | Space Center | Overview: names only on hover, a Labels toggle (tag icon). Context bar: Build · Buildings · Found a branch │ Labels. Buildings is a list at the right (280), toggled | Pins with hover names (plan 259); a "Names" switch in the column; the list is always shown | 273 |
| 17 | Space Center | Build: a 1040-wide bar. Row 1: BUILD, 7 category tabs, Place/Demolish tools, Done. Row 2: cards with icon, chip (BUILT / LOCKED / ×n), name, and cost · time · tiles | The plan 235 build menu: a tab row and cards in the bottom dock | 273 |
| 18 | Space Center | Demolish tool: the hovered building turns red with "Demolish X". Clicking it opens a confirm popover (refund line, Cancel / Demolish) | Remove button in the detail panel, only in build mode | 273 (red tint of the 3D model: draft 274) |
| 19 | Space Center | Focus: the camera zooms to the building; a detail panel at the right (320); a focus bar `← Overview │ ‹ name · Building i of n ›` | The detail panel at the top of the right column, with a Frame button | 273 |
| 20 | Space Center | The placement chip Rotate · Cancel · Place sits above the ghost | The placement info sits in the bottom dock, with Rotate and Done | 273 (as a chip in the build bar; the ghost follows the pointer and is placed by click, ADR 0254) |

## Scope

**In** (rows 1 to 10 of the diff):
- **The merged dock.**
  - The vessel panel's tabs become rail entries in the Vessel group.
  - The crew panel is the Crew entry.
  - The grouped rail has rules between its groups.
  - Rail and panel are one glass box.
- **The navball module** to the v3 geometry, with the throttle arc and the status strip.
- **Staging** at the bottom right, growing up, with the `Δv · Here` chip.
- **Menu-bar actions:** Panels · Navball · Staging · Camera.
- **The region rules** (ADR 0253):
  - one side panel;
  - staging on the right;
  - narrow and drawer behaviour.
- **Unchanged and still required:** UI scale, high contrast, touch controls, drawers at 1024 px and below, and keyboard access.

**Out:**
- Toasts restyle, chip flash, Orbit panel restyle (draft 274).
- The Space Center (plan 273).

## Touches

- **Size:** L
- **Edits:**
  - the flight page
  - `lib/hud/InstrumentDeck.svelte`, `SasButtons.svelte`, `StageStack.svelte`, `CrewPanel.svelte`
  - `lib/hud/status-chips.ts` (new)
  - `lib/dock/*`
  - `lib/vessel-panel/VesselPanel.svelte` (a `tab` prop and no own tab strip)
  - `lib/layout/regions.ts`, `layout-model.ts`
  - the e2e tests that opened the vessel panel
- **Shared contracts:** none (UI only).

## Steps

1. Write ADR 0253.
2. **The dock model.** Add groups to the rail and `host.vessel.*` / `host.crew` entries, with a migration of saved dock choices. Write the vitest.
3. **The VesselPanel.** It takes its tab from outside (`tab`) and can hide its tab strip (`bare`). The dock renders it per entry.
4. **The page.** Remove the vessel panel column, the crew panel and their toggles. Add the Staging toggle. The Crew entry opens on EVA.
5. **`status-chips.ts`.** A pure model (vitest) of the strip: chips, popovers and fixes.
6. **InstrumentDeck to the v3 geometry.** The ball, the arcs, the wing, the pod ring and the strip.
7. **StageStack restyled and moved right.** The narrow rule puts it above the deck.
8. **The regions and the layout model.** Update their vitests.
9. **The e2e tests.** Replace "Vessel panel" with the dock's Vessel tabs; update `base-layout` and `hud-layout`.
10. **Screenshots** at 1440 × 900, 1280 × 800 and 1024 × 768, before and after, in the journal.

## Acceptance criteria

- [ ] The vitest for the dock groups, the status chips and the regions passes (`CI=true bunx vitest run` in `apps/web`, with no obsolete snapshots).
- [ ] The Flight page at 1440 × 900 shows:
  - one dock box at the left whose rail has the Vessel, Flight and Plugins groups and `+`;
  - no vessel panel at the right and no crew panel;
  - staging at right 24 / bottom 56;
  - the 552 × 232 module centred above the status bar, with the throttle arc and the status strip.
  Shown by screenshot.
- [ ] At 1024 × 768:
  - the module, the dock and staging do not overlap;
  - drawer targets are 44 px.
  Shown by screenshot and e2e `hud-layout`.
- [ ] `bun run test`, `bun run typecheck`, `bun run lint` and `bun run build` pass.
- [ ] The e2e smoke and `base-layout`, `hud-layout`, `vessel-panel` and `power` pass on Chromium.

## Docs checklist

- [ ] `docs/STATUS.md` updated.
- [ ] `docs/journal/272-flight-v3.md` written, with screenshots.
- [ ] ADR 0253 accepted and indexed.
- [ ] Draft 274 for what is left.

## Log

- 2026-10-21 — Created from the owner's v3 package. Diff written above; ADR 0253 drafted.
- 2026-10-21 — Built in the worktree branch `ui/272-v3`; ADR 0253; journal 272 with before/after screenshots at 1440, 1280 and 1024.
- 2026-10-21 — e2e on the production build (Chromium). After merging origin/main, the HUD's first model comes about 20 s after `/flight` loads, because WebGPU is the default and headless Chromium has no adapter. Baseline main fails `hud-layout` the same way. The tests now wait up to 60 s for staging, and the main session fixed the adapter check (e87d07a7).
  - Pass: `base-layout` (4), `hud-layout` (4), `smoke` (7), `space-center`, `build-menu`, `astronauts`.
  - Still being re-run on a fresh build when this was pushed: `branch-sites`, `power`, `vessel-panel` (2) and `eva`. Earlier runs had used a stale preview server on port 5192.
  - `eva` also fails on the baseline.
- 2026-10-21 — Pushed to main on the owner's request, before that e2e re-run finished: lint, typecheck, web vitest with `CI=true` and `bun run test` were run first (see the journal). Stays `in-progress` until the four e2e above pass.
