---
id: 113
title: "Mission Center: one place for the whole system"
status: draft
owner: ""
depends: [080, 081, 086]
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 113 — Mission Center: one place for the whole system

## Goal

A Mission Center route shows the whole system full-bleed with selection rings, Tracking (All / Vessels / Relays / Bodies), Upcoming events with warp-to, Contracts (when 099 lands), crew roster (when 106 lands), the agency strip (ledger), a card for the selected object with Fly, and layers Orbits / Network / Labels; the per-vessel Map gets a `Map | Mission Center` switch.

## Context

- ADRs: 0102, 0107
- Read: ADR 0102 point 6, 0107, `refs/space-orbital-program-ui/docs/SCREENS.md` (Mission Center), `packages/renderer/src/map.ts`, `apps/web/src/lib/map-path.ts`, plan 080 (provider).

## Scope

**In:**
- Route `/mission-center` reusing the map renderer with a system-wide camera.
- Tracking list with filters; Fly switches the focus vessel (existing focus command).
- Upcoming: maneuver nodes, SOI changes, construction done, contract deadlines, transfer windows (later), each with warp-to.
- Layer toggles; Network layer is empty until 115.

**Out:** porkchop plots (later).

## Touches

- **Size:** M
- **Edits:** `apps/web/src/routes/mission-center`, `packages/renderer/src/map.ts`, `apps/web/src/lib/map-path.ts`, `apps/web/src/lib/hud`
- **Shared contracts:** renderer API (`Renderer.setMapScope("system")`)

## Design notes

Budget: the Mission Center at 1920x1080 with 50 vessels draws within the map view's current frame time + 1 ms (M5).

## Steps

1. System camera and rings.
2. Tracking and Fly.
3. Upcoming with warp-to.
4. Layers and switch.

## Acceptance criteria

- [ ] vitest: Upcoming lists a maneuver node and an SOI change in time order; warp-to dispatches `warp-to` with the event time.
- [ ] vitest: Fly on a listed vessel changes the focus.
- [ ] Journal: frame time with 50 vessels (M5), screenshots with the self-review against refs Mission Center.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/113-mission-center.md` written.
- [ ] `architecture/overview.md` (Mission Center).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0102, 0107).
