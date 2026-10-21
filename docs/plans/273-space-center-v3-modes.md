---
id: 273
title: "Space Center v3: Overview, Build and Focus modes with a context bar"
status: in-progress
owner: "ui-v3 session (Claude, 2026-10-21)"
depends: [259, 267]
phase: 7
created: 2026-10-21
updated: 2026-10-21
---

# 273 — Space Center v3: Overview, Build and Focus

## Goal

The Space Center follows `refs/space-orbital-program-ui-v3/source/v3/SpaceCenterV3.dc.html` and its three wrappers (`SpaceCenterV3Build`, `-Demolish`, `-Focus`). It is a clean campus with a context bar at the bottom centre whose content changes per mode:

- **Overview:** Build · Buildings · Found a branch │ Labels.
- **Build:** a 1040-wide build bar with category tabs, Place/Demolish tools, Done and the cards.
- **Focus:** the camera on one building, its detail panel at the right, and `← Overview │ ‹ name ›`.

## Context

- **Design:** `refs/space-orbital-program-ui-v3/docs/V3_CHANGES.md` §1, and the diff rows 15 to 20 in [plan 272](272-flight-v3-one-dock-navball-module-staging-right.md).
- **Code:**
  - `apps/web/src/lib/space-center/SpaceCenterOverlay.svelte` and `BuildMenu.svelte`
  - `apps/web/src/routes/(world)/space-center/+page.svelte`
- **ADRs:** 0244 (pins, panel, list), 0251 (pins stay on their anchors; plan 267 owns the pin positions, which this plan does not touch), 0227 (build menu).
- **New ADR:** [0254](../decisions/0254-space-center-modes-and-context-bar.md).

## Scope

**In:**
- The mode state in the overlay.
- The overview context bar and the toggled Buildings list. The site picker, Flows and Market fold into that list.
- The build bar: the build menu restyled into it, with Place and Demolish tools. Demolish works by a click on a pin, with a confirm popover.
- The placement chip in the build bar.
- Focus: selection frames the camera (as before) and shows the v3 detail panel at right 24 / top 80, 320 wide, and the focus bar with previous and next.
- Unchanged and still required: keyboard use, Escape, the e2e ids `sc-*`, and touch.

**Out:**
- A red tint on the 3D model while demolishing (draft 274).
- A Move tool.
- The animated 1.6–3× zoom: the renderer's `setSiteFocus` framing at 160 m stands in for it.

## Touches

- **Size:** M
- **Edits:**
  - `lib/space-center/SpaceCenterOverlay.svelte`, `BuildMenu.svelte`
  - `lib/space-center/sc-mode.ts` (new, pure, with a vitest)
  - the e2e `space-center` and `build-menu`
- **Shared contracts:** none.

## Steps

1. Write ADR 0254.
2. Write `sc-mode.ts`: the mode from (build open, selected), previous and next, and the context bar's entries. Add its vitest.
3. Rebuild the overlay: the context bars, the list, the detail panel, the build bar and the demolish confirm.
4. Update the e2e tests.
5. Take screenshots at 1440 × 900 and 1280 × 800 for all three modes and Demolish.

## Acceptance criteria

- [ ] The vitest for `sc-mode.ts` passes.
- [ ] Screenshots of Overview, Build, Demolish confirm and Focus sit next to the design's in the journal.
- [ ] The e2e tests `space-center`, `build-menu` and `branch-sites` pass on Chromium.
- [ ] `bun run typecheck`, `bun run lint` and `bun run test` pass.

## Docs checklist

- [ ] `docs/STATUS.md`
- [ ] Journal `273-space-center-v3.md`
- [ ] ADR 0254 indexed

## Log

- 2026-10-21 — Created with plan 272 from the owner's v3 package.
