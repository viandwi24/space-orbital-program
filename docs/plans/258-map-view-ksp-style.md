---
id: 258
title: "Map view like KSP: active and inactive orbit styles, vessel icons by type, comms links, and show/hide filters"
status: ready
owner: "Worker B"
depends: []
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 258 — Map view like KSP: active and inactive orbit styles, vessel icons by type, comms links, and show/hide filters

**Size:** L

## Goal

Fix item 18 of `docs/reviews/2026-10-20-owner-manual-test.md` (screenshot `15.webp`).

## Context

- **Owner request, 2026-10-20:**
  - orbits and vessels look like KSP;
  - the active orbit is white and other orbits are grey;
  - vessels show as icons by type, not as dots;
  - comms links are drawn;
  - show/hide toggles let the player choose what the map shows.
- **Current state:** today's map markers are in `apps/web/src/lib/hud/MapMarkers.svelte` (plan 224) and the orbit lines are in the renderer's map layer.
- **Existing data:**
  - vessel types: `packages/core/src/protocol.ts:79-91`, plan 223;
  - comms links: `packages/sim/src/comms.ts`, Mission Center, plans 114–121.
- **References:** KSP's map filters and icons are described in `refs/reverse-engineering-ksp-ksp2/08-navigation-map-vessel-management.md`.

## Scope

**In:**
- **Orbit lines:**
  - the active vessel's orbit is bright white;
  - other vessels' orbits are grey;
  - the target's orbit is highlighted;
  - body orbits are styled by body.
- **Vessel icons:** an icon per vessel type (probe, ship, station, lander, relay, debris, and so on), with a hover label.
- **Comms links:** lines from vessel to relay to ground station, coloured by link quality (KSP CommNet style).
- **Filter bar** in the map, persisted per player:
  - orbits;
  - vessels by type;
  - debris;
  - comms links;
  - ground stations;
  - labels.

**Out:** new comms rules.

## Touches

`packages/renderer` (map layer), `apps/web/src/lib/hud/MapMarkers.svelte`, the map overlay, `apps/web/src/lib/settings/settings.ts`.

## Steps

1. Read the KSP refs. Write an ADR for the icon set and the filters.
2. Implement each part, with unit tests for the filter model and the line-style rules.
3. Take screenshots and add them to the journal.

## Acceptance criteria

- [ ] Active, other and target orbits are styled distinctly.
- [ ] Vessels show type icons.
- [ ] Comms links are drawn.
- [ ] The filters show and hide each layer and persist; tests pass. `[manual]` The owner approves the look.
- [ ] Affected unit tests and the typecheck pass. E2E is paused by the owner.

## Docs checklist

- [ ] STATUS row.
- [ ] Journal with screenshots.
- [ ] ADR.

## Log

- 2026-10-20 — Created by the coordinator from the owner's manual test.
