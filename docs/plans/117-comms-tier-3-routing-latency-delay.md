---
id: 117
title: "Comms tier 3: pointing, routing, latency and the signal-delay rule"
status: in-progress
owner: "Agent 3"
depends: [116, 078]
phase: 7
created: 2026-10-17
updated: 2026-10-18
---

# 117 — Comms tier 3: pointing, routing, latency and the signal-delay rule

## Goal

Dishes point at a target, links form a routing graph with Auto / Manual / Policy routing and shared capacity, every route has a latency (light time), and the `signalDelay` rule works: `display` (default, shown not enforced), `enforced` (commands arrive after the delay), `flight-computer` (enforced, scripts run on board).

## Context

- ADRs: 0101, [0188](../decisions/0188-comms-routing-pointing-capacity-latency-signal-delay.md) (this plan)
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

- [x] `packages/sim` test: with `enforced` a throttle command to a vessel 3 light-seconds away applies exactly 3 s of sim time later; with `display` it applies at once and the HUD shows 3 s.
- [x] `packages/sim` test: Manual route pinned through a relay is used even when a direct link exists, and broken when the relay is occluded.
- [x] Migration test with a frozen fixture of the previous format.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/117-comms-tier-3-routing-latency-delay.md` written.
- [x] `architecture/simulation.md`, `guides/scripting.md` (delay).
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101).
- 2026-10-18 — Claimed by Agent 3 (`claim/117`, branch `devc/117-comms-routing`).
- 2026-10-18 — ADR 0188 covers:
  - every vessel with an antenna as a relay, in a routing graph with a widest-path tree;
  - dish pointing by beam width;
  - Auto, Manual (pinned, `route broken at <id>`) and Policy (`defineRoutePolicy`) routes;
  - capacity shared over three proportional rounds;
  - latency, and the delay queue by command source;
  - save format 7, with the frozen fixture `save-v6.json`.
- 2026-10-18 — Done here, handed over as `ready/117`:
  - **Sim tests:** `packages/sim/test/comms-routing.test.ts` (7) checks `enforced` at exactly 3 s, `display` at once with 3 s shown, the flight computer, a Manual route through a relay that breaks when it is occluded, policies, pointing, and the 6 → 7 migration.
  - **Benchmark:** 180 to 207 µs per step here, under the 500 µs budget.
  - **Full checks:** in the journal.

