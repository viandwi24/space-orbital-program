---
id: 121
title: "Comms tier 6: suit radios, voice and live broadcasts"
status: draft
owner: ""
depends: [120, 109, 108, 102]
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 121 — Comms tier 6: suit radios, voice and live broadcasts

## Goal

Crew on EVA carry a low-power UHF suit radio relayed by their lander or rover (walking behind a hill cuts it and blocks EVA science transmission); a crew radio stat lowers the needed signal; voice is a data kind; live broadcasts of big events (a first landing) give extra reputation when the link has the rate.

## Context

- ADRs: 0101, 0100
- Read: ADR 0101 tier 6, ADR 0100, plan 109 (EVA).

## Scope

**In:**
- Suit radio antenna on the EVA vessel; relay through the nearest crewed vessel.
- Crew panel bars and the Comms tab's suit section live.
- Broadcast action on milestones (102) with a rate requirement.

**Out:** radio astronomy with big dishes (later).

## Touches

- **Size:** S
- **Edits:** `mods/stock`, `packages/sim`, `apps/web/src/lib/hud`
- **Shared contracts:** none beyond tier 1 to 5 contracts

## Design notes

Terrain occlusion for the suit uses the tier 1 terrain test at short range.

## Steps

1. Suit radio.
2. UI bars.
3. Broadcasts.

## Acceptance criteria

- [ ] `packages/sim` test: an EVA crew member 200 m behind a ridge from the lander loses the suit link at the geometric point.
- [ ] `packages/sim` test: broadcasting the first landing with enough rate books the stated reputation bonus.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/121-comms-tier-6-suit-radios-voice-broadcast.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101, 0100).
- 2026-10-17 — `depends` gains 108, 102 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): the crew panel bars are those of plan 108 and broadcasts fire on milestones of plan 102.
