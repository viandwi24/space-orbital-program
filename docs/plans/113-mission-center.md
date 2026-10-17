---
id: 113
title: "Mission Center: one place for the whole system"
status: in-progress
owner: "Agent 1"
depends: [080, 081, 086]
phase: 7
created: 2026-10-17
updated: 2026-10-18
---

# 113 — Mission Center: one place for the whole system

## Goal

A Mission Center route shows the whole system full-bleed with selection rings, Tracking (All / Vessels / Relays / Bodies), Upcoming events with warp-to, Contracts (when 099 lands), crew roster (when 106 lands), the agency strip (ledger), a card for the selected object with Fly, and layers Orbits / Network / Labels; the per-vessel Map gets a `Map | Mission Center` switch.

## Context

- ADRs: 0102, 0107, [0118](../decisions/0118-mission-center-system-scope-own-sim-and-fly.md) (decisions of this plan)
- Read: ADR 0102 point 6, 0107, `refs/space-orbital-program-ui/docs/SCREENS.md` (Mission Center) and `source/Map.dc.html`, `packages/renderer/src/scene.ts` (map view), `apps/web/src/lib/map-path.ts`, `map-pick.ts`, plan 080 (provider), plan 114 (network snapshot).

## Scope

**In:**
- Route `/mission-center`: its own sim from the world's save (ADR 0118 point 1), the map renderer with the system scope, selection rings, labels.
- Tracking list with filters All / Vessels / Relays / Bodies; the selected object's card (three facts, Fly for the save's focus vessel).
- Upcoming: maneuver nodes and sphere-of-influence changes, each with warp-to; Contracts (started objectives); crew roster; the agency strip (ledger).
- Layers Orbits / Network / Labels; the `Map | Mission Center` switch in the flight's map view; the Space Center's Mission Center building opens it.

**Out:** porkchop plots and transfer windows (later), construction done (096), contract deadlines (099), relays (117), flying a vessel other than the save's focus (needs per-vessel designs, follow-up).

## Touches

- **Size:** M
- **Edits:** `apps/web/src/routes/mission-center` (new), `apps/web/src/lib/mission-center` (new), `packages/renderer/src/scene.ts`, `packages/renderer/src/renderer.ts`, `packages/renderer/src/map.ts`, `apps/web/src/lib/map-path.ts`, `apps/web/src/lib/hud`, `apps/web/src/routes/flight`, `apps/web/src/lib/save/save-controller.svelte.ts` (an autosave that returns its id), `apps/web/src/lib/space-center/model.ts` (the building's action)
- **Shared contracts:** renderer API (`setMapScope`, `setMapHighlight`, `setMapLayers`, additive)

## Design notes

Budget: the Mission Center at 1920x1080 with 50 vessels draws within the map view's current frame time + 1 ms (M5). The 50 vessels come from a tool that launches the stock rocket to orbit 50 times in one headless sim and writes a game save.

## Steps

1. ADR 0118; renderer system scope, highlight and orbit layer, with tests.
2. `lib/mission-center/model.ts`: tracking rows and filters, upcoming events, the warp-to command, the card and its Fly state; vitest.
3. Route, overlay (refs Mission Center), labels and network over the canvas, pick.
4. The switch in the flight's map view, Fly through an autosave, the Space Center's building.
5. Measurement with 50 vessels (M5), screenshots, journal.

## Acceptance criteria

- [ ] vitest: Upcoming lists a maneuver node and an SOI change in time order; warp-to dispatches `warp-to` with the event time (a node: its time minus the maneuver lead).
- [ ] vitest: Fly on the save's focus vessel writes an autosave and opens the flight with that save (the vessel in focus); another vessel's card says why it cannot be flown.
- [ ] Renderer test: the system scope anchors at the root body and frames the moon's orbit; the highlight colours the chosen vessel's orbit.
- [ ] Journal: frame time with 50 vessels against the map view (M5), screenshots with the self-review against refs Mission Center.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/113-mission-center.md` written.
- [ ] `architecture/overview.md` (Mission Center).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0102, 0107).
- 2026-10-18 — Claimed by Agent 1 and refined: ADR 0118 (own sim from the world's save, system scope, Fly only for the save's focus vessel); the Fly criterion narrowed to that; a renderer criterion added; Touches list the flight route, the save controller and the Space Center model.
