---
id: 115
title: "Comms tier 1 in the interface: link state, Comms tab, Network layer"
status: draft
owner: ""
depends: [114, 111, 113]
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 115 — Comms tier 1 in the interface: link state, Comms tab, Network layer

## Goal

The player sees the network: a link indicator and the reason when it breaks, the vessel panel's Comms tab (route to the station, endpoints, on-board transmitters), signal bars on the crew panel, and a Network layer in the Map and Mission Center drawing links and coverage.

## Context

- ADRs: 0101, 0107
- Read: ADR 0101 point 5, `refs/space-orbital-program-ui/docs/CONCEPT.md` §4 (Comms tab), plan 114.

## Scope

**In:**
- HUD link badge replacing the blackout-only badge (blackout becomes one of the reasons).
- Comms tab: Auto route (Manual arrives with 117), endpoints, transmitters with on/off from descriptors.
- Network layer: link lines coloured by state, station markers.

**Out:** link budget numbers (116).

## Touches

- **Size:** M
- **Edits:** `apps/web/src/lib/hud`, `packages/renderer/src/map.ts`, `apps/web/src/routes/mission-center`
- **Shared contracts:** none

## Design notes

Every broken link names its cause (occluded by <body>, out of range, blackout, antenna off).

## Steps

1. Badge.
2. Comms tab.
3. Network layer.

## Acceptance criteria

- [ ] vitest: a snapshot with an occluded link shows "Occluded by <moon>" in the badge and the tab.
- [ ] vitest: the Network layer receives one line per link from the snapshot.
- [ ] Screenshots in the journal.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/115-comms-tier-1-interface.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101, 0107).
