---
id: 108
title: "Astronaut Complex and the crew panel"
status: draft
owner: ""
depends: [106, 088, 091]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 108 — Astronaut Complex and the crew panel

## Goal

The Astronaut Complex screen (Roster, Applicants, Lost; filters by profession; profile with chips, XP, stats, skills, flight log) and the flight HUD's crew panel (bottom right: each crew member with an EVA/IVA suit chip and radio bars) follow the refs.

## Context

- ADRs: 0100, 0107
- Read: ADR 0100, 0107, `refs/space-orbital-program-ui/docs/SCREENS.md` (Astronaut Complex) and `CONCEPT.md` §4 (crew panel).

## Scope

**In:**
- Route `/astronauts` from the building.
- Recruit and dismiss commands (costs when the economy is on).
- Crew panel in the HUD; radio bars show "no radio" until comms tier 6.
- Launch screen seats become active.

**Out:** suit radios (121).

## Touches

- **Size:** M
- **Edits:** `apps/web/src/routes/astronauts`, `apps/web/src/lib/hud`, `apps/web/src/routes/launch`
- **Shared contracts:** none

## Design notes

Stats shown are the model's real values; unknowns are `[—]`.

## Steps

1. Screen.
2. HUD panel.
3. Seats at launch.

## Acceptance criteria

- [ ] vitest: the roster filters by profession; recruiting adds a member and books the cost.
- [ ] vitest: the crew panel lists the focused vessel's crew with IVA chips.
- [ ] `bun run e2e` (Chromium): assign two crew at Launch and see them in flight.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/108-astronaut-complex-and-crew-panel.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0100, 0107).
