---
id: 274
title: "v3 design leftovers: toasts, the chip flash, the Orbit panel, the demolish tint, the shell's Overview hook"
status: done
owner: "ui-v3 session (Claude, 2026-10-22)"
depends: [272, 273]
phase: 7
created: 2026-10-21
updated: 2026-10-22
---

# 274 — v3 design leftovers

## Goal

Finish the parts of `refs/space-orbital-program-ui-v3` that plans 272 and 273 left out (rows 10, 11, 12 and 18 of the diff in [plan 272](272-flight-v3-one-dock-navball-module-staging-right.md)).

## Context

- `refs/space-orbital-program-ui-v3/docs/V3_CHANGES.md` §1.3, §1.4, §2.1 and §2.2
- `source/v3/FlightV3.dc.html` and `SpaceCenterV3.dc.html`
- ADRs 0253 and 0254

## Scope

**In:**
- **Toasts** (V3 §2.2): top 24, 380 wide, at most 2, a 28 px icon tile, title 12/600 and body 10, a dismiss ×, and repeated events merged into a `×n` badge.
- **The chip flash:** when an action fails because of a condition already on a chip (throttle or SAS while uncontrolled), that chip flashes with a coloured outline for 1.2 s.
- **The Orbit panel** (V3 §2.1): one right-aligned value column, the time as sub-text, warp as an icon at the end of the Ap/Pe rows, and no dashed underlines.
- **Demolish:** the hovered 3D building is tinted red (a renderer hook).
- **The shell:** the menu bar's Space Center icon returns the Space Center to Overview.

**Out:**
- The Move tool.
- The map and Mission Center in v3.

## Acceptance criteria

- [x] Each item is in the code, with a vitest for the pure parts (toast merge in `toasts.test.ts`, the chip to flash in `status-chips.test.ts`); the demolish box is in the journal's Space Center screenshot.

## Docs checklist

- [x] `docs/STATUS.md`
- [x] Journal `274-v3-design-leftovers.md`

## Log

- 2026-10-21 — Drafted by plans 272 and 273.
- 2026-10-22 — Done, on the owner's word to finish v3 (via the main session):
  - **Toasts.** At most two, 380 wide. The same event merges into one toast with a ×n badge (`addToast` counts; `LiveToast.count`), each has a dismiss button, and the icon tile is in the event's tone.
  - **Chip flash.** `chipToFlash` maps a refused command, or the out-of-power event, to the chip that explains it, and the strip flashes it for 1.2 s.
  - **The Orbit panel** has one right-aligned value column, the apsis times as sub-text, warp icons at the row ends and no dotted underlines. The `warp-to-ap` and `warp-to-pe` test ids are kept.
  - **Demolish.** The bulldozer's building gets the red ghost box over its footprint. The site's buildings are one merged mesh, so a per-building tint would need a renderer change; the box was enough.
  - **Back to Overview.** `pageShell.home`: pressing the page's own fixed icon calls it, and the Space Center returns to Overview.
