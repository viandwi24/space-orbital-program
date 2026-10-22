---
id: 349
title: "Space Center: the Buildings list as a strip of cards along the bottom, like the Build menu"
status: done
owner: "ui-v3 session (Claude, 2026-10-22)"
depends: [273, 235, 259]
phase: 7
created: 2026-10-22
updated: 2026-10-22
---

# 349 — The Buildings strip

## Goal

The owner's feedback of 2026-10-22 (screenshot `refs/owner-shots/space-center-buildings-2026-10-22.jpg`): the Buildings list should not be a panel in the top-right corner. It should look like the Build menu: a wide strip along the bottom, with an icon for each building.

## Context

- ADR 0298 (this plan's decision), ADR 0254 (the Space Center modes; point 2 is changed in part)
- Plan 235 (the build cards' thumbnails), plan 259 (pins and framing), plan 274 (the demolish box)

## Scope

**In:**
- The Buildings strip above the Overview bar: the Build bar's glass and width, a header (BUILDINGS, the count, the attention line, Flows and Market as toggles, the site picker), and one card per building.
- Each card shows the build menu's thumbnail of the building (or an icon), a status chip (running, building, upgrading, planned), the name, "Level n of m" or the status words, and a progress bar while the building is being built or upgraded.
- Hovering a card shows the building's name over the scene and boxes the building in white. A click selects it, frames the camera and opens its panel. The strip comes back with Overview.
- The cards scroll sideways when there are many, and the arrow keys step through them.

**Out:**
- The Focus panel and the Build menu, which are not changed.

## Steps

1. `BuildingRow.progress`, `.generator`, `.size`; `progressOf`.
2. The strip in `SpaceCenterOverlay.svelte`; the page passes `picture` and boxes the hovered card's building.
3. Tests, the base-layout e2e expectation, screenshots, docs.

## Acceptance criteria

- [x] The Buildings toggle opens a bottom strip 8 px above the Overview bar, as wide as the build bar. There is no corner panel.
- [x] Every card has its thumbnail, status chip, name and level, and a progress bar while work runs (`model.test.ts`: `progressOf`).
- [x] Hovering a card boxes its building in the scene. A click frames the camera on it and opens its panel.
- [x] The test ids are kept: `sc-buildings-list`, `sc-list`, `sc-row-*`, `sc-attention`, `sc-flows`, `sc-market`, `sc-site`. The `base-layout` e2e expects the strip's new place.
- [x] Typecheck and the Space Center vitest pass. e2e was not run.

## Docs checklist

- [x] `docs/STATUS.md`
- [x] ADR 0298 and its index row
- [x] Journal `349-space-center-buildings-strip.md`

## Log

- 2026-10-22: Written from the owner's feedback (relayed by the main session) and done the same day.
