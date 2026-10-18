---
id: 121
title: "Comms tier 6: suit radios, voice and live broadcasts"
status: done
owner: "Agent 3"
depends: [120, 109, 108, 102]
phase: 7
created: 2026-10-17
updated: 2026-10-18
---

# 121 — Comms tier 6: suit radios, voice and live broadcasts

## Goal

Crew on EVA carry a low-power UHF suit radio relayed by their lander or rover (walking behind a hill cuts it and blocks EVA science transmission); a crew radio stat lowers the needed signal; voice is a data kind; live broadcasts of big events (a first landing) give extra reputation when the link has the rate.

## Context

- ADRs: 0101, 0100, [0193](../decisions/0193-comms-tier-6-suit-radios-broadcasts.md) (new)
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

1. Suit radio: a stock UHF suit antenna (`suit: true`) on the EVA suit. A suit links only to a crewed vessel that is not a suit (no station, probe or other suit); it is not a control point and nobody routes through it. Its range is scaled by the wearer's `radio` ability (a crew stat; engineers start at 1.1). An edge with a suit samples the terrain every metre (tier 1's test, finer at short range). Voice is the stock `stock.voice` data kind (already registered).
2. UI bars: the crew panel's EVA section shows the suit radio's bars, what it relays through and why it is cut; rows show the vessel's bars instead of the "no radio" placeholder.
3. Broadcasts: `comms-broadcast { milestone }` within an hour of the first, once, when the milestone's vessel has a route at `BROADCAST_RATE` or more: `BROADCAST_FACTOR` × the milestone's reputation as `comms.broadcast`. `Snapshot.network.broadcasts` lists the open ones; the HUD offers a Broadcast button.

## Acceptance criteria

- [x] `packages/sim` test: an EVA crew member 200 m behind a ridge from the lander loses the suit link at the geometric point (within 1 m), with the reason `blocked by terrain`; in sight it relays through the lander.
- [x] `packages/sim` test: a suit never links to a station or a probe, and a probe never routes through a suit.
- [x] `packages/sim` test: broadcasting the first landing with enough rate books the stated reputation bonus; without the rate, after the window or twice it is refused with a reason.
- [x] vitest: the crew panel shows the suit radio's bars and the cut reason; the broadcast offer renders.
- [x] `bun run check:affected` passes (CI runs the full suite).

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/121-comms-tier-6-suit-radios-voice-broadcast.md` written.

- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101, 0100).
- 2026-10-17 — `depends` gains 108, 102 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): the crew panel bars are those of plan 108 and broadcasts fire on milestones of plan 102.
- 2026-10-18 — Claimed by Agent 3, refined. Implemented per ADR 0193: suit radios relayed by a crewed vessel in sight with metre terrain sampling, the `radio` ability, live broadcasts of firsts, the crew panel's bars and offers. `comms-suit.test.ts` (4) and `crew-card.test.ts` (+2) pass; `check:affected` passed (journal 121). Handed over as `ready/121`.
