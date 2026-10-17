---
id: 070
title: "Communications: index of the comms tier plans 114 to 121"
status: draft
owner: ""
depends: [040, 114, 115, 116, 117, 118, 119, 120, 121]
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 070 — Communications (index)

## Goal

A vessel can lose its link, and the network becomes a game: this is the index of the communications programme of ADR 0101 (tiers 1 to 6, chosen by the owner as one programme). The work itself is in plans 114 to 121; this file holds no steps of its own and is kept so the public roadmap (which links it) and older references stay valid.

## Context

- ADRs: 0101 (model, tiers, defaults), 0079 (blackout display, amended by 0101), 0096 (world tick), 0099 (data and science).
- Found in plan 040: the blackout badge says "signal lost" and nothing is lost. Tier 1 (plan 114) makes the blackout drop the link.
- Defaults decided by the owner: signal delay `display` (shown, not enforced), `enforced` and `flight-computer` as world rules; control without signal (ADR 0109: `none` for probes in Career/Science, `full` in Sandbox; crewed vessels always controllable) — formerly `full` by default (ADR 0101 point 4).

## Scope

| Tier | Plan | What |
|---|---|---|
| 1 | [114](114-comms-tier-1-model.md) | antennas, line of sight, ground stations, control states, real blackout |
| 1 | [115](115-comms-tier-1-interface.md) | link badge, Comms tab, Network layer |
| 2 | [116](116-comms-tier-2-link-budget.md) | link budget, bands, data rates, comms scale, inspector |
| 3 | [117](117-comms-tier-3-routing-latency-delay.md) | pointing, routing, capacity, latency, the delay rule |
| 3 | [118](118-comms-planning-tools.md) | contact timeline, coverage map, constellation planner |
| 4 | [119](119-comms-tier-4-queues-store-and-forward.md) | queues, store-and-forward, contact windows |
| 5 | [120](120-comms-tier-5-channels-licences-interference.md) | channels, licences, interference, encryption |
| 6 | [121](121-comms-tier-6-suit-radios-voice-broadcast.md) | suit radios, voice, broadcasts |

**Out:** nothing here; scope lives in the tier plans.

## Touches

- **Size:** XL (sum of the tier plans); this index edits nothing.
- **Edits:** none (see the tier plans: mostly `mods/stock`, `packages/sim`, `packages/sdk`, `packages/renderer/src/map.ts`, `apps/web/src/lib/hud`).
- **Shared contracts:** see the tier plans (SDK comms define points, snapshot `network`, save bumps at tiers 3 and 4).

## Acceptance criteria

- [ ] Plans 114 to 121 are `done`; then this index is set to `done` with a short journal entry that links them, and the public roadmap item moves to the tier plans (plan 076).

## Docs checklist

- [ ] STATUS, journal (index closure), roadmap item (plan 076).

## Log

- 2026-10-17 — Created as draft by plan 040 (found, not done).
- 2026-10-17 — Realigned with the owner's Fondasi Orbital decisions (ADR 0101): the plan becomes the index of the comms tier plans 114 to 121; its earlier scope (link model, delay, loss of control, HUD, SDK hook) is covered and superseded by them.
- 2026-10-17 — `depends` gains 114, 115, 116, 117, 118, 119, 120, 121 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): this index is done only when plans 114 to 121 are done (its own acceptance criterion).
- 2026-10-17 — Defaults updated by ADR 0109: control needs a command source (crew aboard or linked probe), `controlWithoutSignal` none in Career/Science and full in Sandbox, Career crew presets standard + hardcore.
