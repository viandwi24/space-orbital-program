---
id: 259
title: "Space Center building UI: research building-game interfaces, then labels that fit the scene, a proper building panel and a tidy right panel"
status: done
owner: "Worker B"
depends: []
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 259 — Space Center building UI: research building-game interfaces, then labels that fit the scene, a proper building panel and a tidy right panel

**Size:** L

## Goal

Fix items 20–22 of `docs/reviews/2026-10-20-owner-manual-test.md` (screenshots `17`–`19`).

## Context

- **Owner request, 2026-10-20:**
  - The site picker is good.
  - The right panel (building list, "Needs attention") looks bad.
  - The building name labels do not blend with the scene. The owner suggests labels on hover, and asks to research how building games do it.
  - Opening a building shows only a simple panel at the top right; the owner asks to research a good building UI first.
- **Code:**
  - `apps/web/src/lib/space-center/{SpaceCenterOverlay,BuildMenu}.svelte`
  - `apps/web/src/lib/space-center/model.ts`
  - `apps/web/src/routes/(world)/space-center/*`
  - the 3D labels
- **Design references:** the v2 design in `refs/space-orbital-program-ui-v2/`, and ADR 0222 (city-builder build menu, plan 235).

## Scope

**In:**
1. **Research.** A short `refs/space-center-ui-research.md` covering:
   - Cities: Skylines I/II info views and building panels;
   - KSP's KSC building highlight and tooltip;
   - KSP2's KSC;
   - Anno, Frostpunk, Planet Coaster;
   - the patterns: label on hover or select, a world-anchored label style, building info panels (header art, level, upkeep, actions, upgrade), and the selection outline.

   Use web research only; do not bypass any bot checks.
2. **Labels.** Labels fit the scene: shown on hover or select (or a "Labels" toggle), styled to match the v2 tokens, and anchored to the building with a leader line or an outline. Pick the pattern from the research.
3. **Building panel.** A proper panel when a building is opened, with:
   - name;
   - level;
   - status;
   - what it does;
   - upkeep;
   - upgrade (cost, days);
   - the main action (Open Hangar / Launch / and so on);
   - a camera that frames the building.
4. **Right panel.** The right panel (buildings list and attention) is tidy and compact, or folded into the new panel, as the research suggests.

**Out:** new buildings.

## Touches

`apps/web/src/lib/space-center/*`, `routes/(world)/space-center/*`, the renderer's site labels and camera framing.

## Steps

1. Write the research doc, then an ADR.
2. Implement the labels, the building panel and the right panel, with unit tests for the model.
3. Take screenshots before and after and add them to the journal.

## Acceptance criteria

- [x] The research doc ([refs/space-center-ui-research.md](../../refs/space-center-ui-research.md)) and the ADR ([0243](../decisions/0243-space-center-pins-building-panel-compact-list.md)) are written.
- [x] Labels follow the chosen pattern; the building panel and the right panel are done.
- [ ] Screenshots are in the journal (not taken: the browser run was left to the owner's check). `[manual]` The owner approves.
- [x] Affected unit tests and the typecheck pass. E2E is paused by the owner (2026-10-20).

## Docs checklist

- [x] STATUS row.
- [ ] Journal with screenshots (journal written; screenshots pending).
- [x] Research doc.
- [x] ADR.

## Log

- 2026-10-20 — Created by the coordinator from the owner's manual test. It follows 258 in Worker B's queue.
- 2026-10-21 — Worker B: research (web search was thin; sourced and recalled parts are marked), ADR 0243, pins, building panel, compact list, camera framing (`setSiteFocus`). Unit tests only.
