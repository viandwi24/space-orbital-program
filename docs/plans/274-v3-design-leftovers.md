---
id: 274
title: "v3 design leftovers: toasts, the chip flash, the Orbit panel, the demolish tint, the shell's Overview hook"
status: draft
owner: ""
depends: [272, 273]
phase: 7
created: 2026-10-21
updated: 2026-10-21
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

- [ ] Each item is shown by a screenshot next to the design, with a vitest for any pure part (toast merge, flash timing).

## Log

- 2026-10-21 — Drafted by plans 272 and 273.
