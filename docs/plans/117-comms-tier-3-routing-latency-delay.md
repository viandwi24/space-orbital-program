---
id: 117
title: "Comms tier 3: pointing, routing, latency and the signal-delay rule"
status: draft
owner: ""
depends: [116, 078]
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 117 — Comms tier 3: pointing, routing, latency and the signal-delay rule

## Goal

Dishes point at a target, links form a routing graph with Auto / Manual / Policy routing and shared capacity, every route has a latency (light time), and the `signalDelay` rule works: `display` (default, shown not enforced), `enforced` (commands arrive after the delay), `flight-computer` (enforced, scripts run on board).

## Context

- ADRs: 0101
- Read: ADR 0101 tier 3 and point 4, ADR 0031 and 0039 (scripts and warp), `docs/architecture/scripting.md`.

## Scope

**In:**
- Pointing (dish target, beam width); routing graph (widest path), Manual pinned routes, Policy as registered pure functions.
- Capacity sharing by bounded proportional rounds.
- Latency per route; the command queue in the sim delays player commands by the route's latency when enforced.
- Flight-computer mode: the script runner's commands are not delayed, the player's are.
- Save: pinned routes and policies (format bump with migration).

**Out:** planning tools (118), queues (119).

## Touches

- **Size:** M
- **Edits:** `mods/stock`, `packages/sim`, `packages/core`, `packages/scripting`, `apps/web/src/lib/hud`
- **Shared contracts:** **protocol (route commands, delayed command queue), save (format bump: routes, policies)**

## Design notes

Determinism: queued commands carry their arrival sim time; ties by id.

## Steps

1. Pointing and graph.
2. Routing modes and capacity.
3. Latency and the delayed queue.
4. Rule wiring and save bump.

## Acceptance criteria

- [ ] `packages/sim` test: with `enforced` a throttle command to a vessel 3 light-seconds away applies exactly 3 s of sim time later; with `display` it applies at once and the HUD shows 3 s.
- [ ] `packages/sim` test: Manual route pinned through a relay is used even when a direct link exists, and broken when the relay is occluded.
- [ ] Migration test with a frozen fixture of the previous format.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/117-comms-tier-3-routing-latency-delay.md` written.
- [ ] `architecture/simulation.md`, `guides/scripting.md` (delay).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101).
