# 0205 — Vessel panel v2, part inspector and HUD layout spec

**Status:** accepted
**Date:** 2026-10-18
**Plan:** plans/214-vessel-panel-v2.md, plans/215-hud-layout-spec.md
**Builds on:** ADR 0174 (part action descriptors), ADR 0107 (refs visual language), ADR 0201 (Base layout)

## Context

The vessel panel is narrow and shallow. It has no resources tab and no per-part inspector, and part types lack the controls a KSP player expects from day one (rancangan §7.6b, research doc 03 §6.3). Regions have no agreed sizes. The camera jumps 150–200 px sideways whenever a side panel opens or closes: since plan 023 the image centre moves to the middle of the uncovered area (`packages/renderer/src/scene.ts:766-779`, insets from `flight/+page.svelte:606-624`). KSP does not move the camera when a window opens, and our panels float over the 3D view. Rancangan §7.

## Decision

1. **Vessel panel:** 340 px wide, resizable 300–440 px. Below 300 px sliders become a number with − and + buttons. Tabs: Overview (group switches with counts, "Engines 3/4"), Parts (grouped by type, search, stage filter), **Resources** (level, rate, time to empty, transfer), Comms.
2. **Part inspector,** one component for Hangar and Flight. It opens from a click on the part in 3D or on its row. 320 px wide. **Pin up to 3**, stacked left of the panel, never over the vessel. Values can be typed with units. Advanced items sit under "More".
3. **Per-part-type controls** follow rancangan §7.6b's P0 column and come from descriptors (ADR 0174), so the inspector, action groups and scripts share them. Every part shows name, highlight, pin, temperature bar when hot and action-group membership.
4. **Two-way highlight** between row and part. State is always read from the sim. Status always has text, never colour alone.
5. **HUD regions** (px at 100 % scale, min – default – max): left dock 260 – 280 – 400; vessel panel 300 – 340 – 440; navball 390 × 262 fixed; staging 200 – 220 – 280 with a capped height; crew at most 3 rows; toasts at most 4, under the menu bar, never over the navball. Docks and panels scroll inside a capped height.
6. **Breakpoints:** ≥ 1440 px both side panels may be open; < 1280 px one side panel; ≤ 1024 px drawers and 44 px touch targets. Text floor 10 px at every UI scale. Bottom panels sit at `bottom: 56px`.
7. **Side panels do not move the camera.** The camera keeps a constant vertical offset computed from the always-present time bar, navball module and status bar. If any offset ever changes, it eases over about 250 ms and respects reduced motion. A Settings option "Centre the vessel in the free area" brings back today's behaviour, default off.

## Alternatives considered

- **Keep shifting the camera to the free area** — rejected: the jump is the owner's top complaint here; it stays as an opt-in setting.
- **Separate inspectors for Hangar and Flight** — rejected: two components drift; the owner asked for one.
- **A fixed-width panel** — rejected: long part names and numbers need room on wide screens.

## Consequences

- Plan 214 delivers the panel, the inspector and the per-type controls; plan 215 delivers the region spec, the breakpoints and the camera rule. Plan 218 reuses the inspector in the Hangar.
- `scene.ts` loses the horizontal inset shift; e2e asserts that toggling a panel does not move the vessel on screen.
