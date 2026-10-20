---
id: 256
title: "Flight UI fixes from the owner's test: a vessel panel with accordions and icon buttons, dock tabs that do not stretch, the camera anchor, one paused badge, aligned map tabs"
status: ready
owner: "Worker A"
depends: []
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 256 — Flight UI fixes from the owner's test: a vessel panel with accordions and icon buttons, dock tabs that do not stretch, the camera anchor, one paused badge, aligned map tabs

**Size:** L

## Goal

Fix items 4 (badge only), 6, 7, 8, 17 and 19 of `docs/reviews/2026-10-20-owner-manual-test.md`.

## Context

The owner tested by hand on 2026-10-20. Screenshots are in `docs/reviews/assets/2026-10-20-owner-test/`.

- **Item 6, dock tab rail** (`06`, `07`). The dock's tab rail grows with a tall panel, for example Script. Look at `apps/web/src/lib/layout/Dock.svelte` and the flight page.
- **Item 7, camera anchor** (`08`). Hiding the navball or HUD moves the camera's centre anchor up; the owner expects it to move down. The view insets live in `routes/(world)/flight/+page.svelte` (plan 215: inset from the time bar and deck) and in `packages/renderer/src/scene.ts`, `setViewInsets`.
- **Item 8, vessel panel** (`09`).
  - The vessel panel (`apps/web/src/lib/vessel-panel/VesselPanel.svelte`, `ControlRows.svelte`) shows every part expanded, with large text buttons.
  - The owner wants:
    - collapsed accordions by default, as in KSP's Part Action Window and KSP2's parts manager;
    - icon buttons with tooltips;
    - a compact layout.
  - See `refs/reverse-engineering-ksp-ksp2/03-part-control-and-tweakables.md` and `04-flight-hud-and-panel-layout.md`.
- **Items 4 and 17, paused chip** (`04`, `14`). The place-pause chip ("PAUSED · HANGAR", "PAUSED · MENU") renders as an odd outlined text. The manual-pause badge ("PAUSED") looks right. See `apps/web/src/lib/layout/TimeBar.svelte` and `apps/web/src/lib/clock-state.ts`.
- **Item 19, map tabs** (`16`). The Map / Mission Center tabs are not aligned in y with the time bar and the menu bar.

## Scope

**In:**
- **Vessel panel redesign:**
  - each part row collapsed by default, with a one-line summary;
  - a chevron to expand, remembering open rows per vessel;
  - actions as icon buttons with tooltips: control from here, transfer, lock, inspect;
  - resource bars compact;
  - groups collapsible.
- **Dock tab rail:** keeps its own height; the panel scrolls inside.
- **Camera anchor:** moves the right way when panels hide, with a test.
- **One badge component** for every pause state: manual, place and lock.
- **Map tabs:** aligned with the bars.

**Out:** new controls.

## Touches

`apps/web/src/lib/vessel-panel/*`, `apps/web/src/lib/inspector/*`, `apps/web/src/lib/layout/{Dock,TimeBar}.svelte`, `apps/web/src/lib/clock-state.ts`, `routes/(world)/flight/+page.svelte`, the map overlay tabs, `packages/renderer/src/scene.ts`.

## Steps

1. Read the KSP/KSP2 refs and the v2 design. Write an ADR for the vessel panel layout.
2. Implement the fixes, with unit tests for:
   - the inset maths;
   - the badge states;
   - the panel model's collapsed state.
3. Take screenshots before and after and add them to the journal.

## Acceptance criteria

- [ ] The vessel panel is collapsed by default, with icon actions. `[manual]` The owner approves.
- [ ] Tall panels do not stretch the dock's tab rail.
- [ ] Hiding panels moves the camera anchor toward the free space; test passes.
- [ ] Every pause state uses the same badge.
- [ ] The map tabs align with the bars.
- [ ] Affected unit tests and the typecheck pass. E2E is paused by the owner.

## Docs checklist

- [ ] STATUS row.
- [ ] Journal with screenshots.
- [ ] ADR.

## Log

- 2026-10-20 — Created by the coordinator from the owner's manual test.
