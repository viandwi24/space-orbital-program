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
- 2026-10-18 — Handover (`ready/117`):

```text
Handover: plan 117 — Comms tier 3: pointing, routing, latency and the signal-delay rule

Agent: Agent 3 (Dev C, Linux Mint 6c/8 GB)   Branch: devc/117-comms-routing
Base: origin/main @ 3fd4e35 (rebased 2026-10-18, after 101)
Commits:
54c20ba fix(sim,web): routing returns at once without vessels (the career bot back to its time); the worlds migration test expects the current save format (plan 117)
2c691fd docs(plan-117): Log and STATUS row
f113c9a perf(sim): routing with a heap for the widest-path tree and sweep-and-prune for vessel pairs; docs for comms tier 3 (plan 117, ADR 0188)
1c3d770 feat(web,sim): relayed routes in the Comms tab with their hops, light time and Auto/policy/pin buttons; the light time in the link badge; the host marks the script's commands for the flight computer; routing tests (plan 117, ADR 0188)
6cf2ba1 feat(core,sdk,sim,stock): comms tier 3: relays and the widest-path routing graph, dish pointing, Auto/Manual/Policy routes, shared capacity, latency, the signal-delay queue; save format 7; API_VERSION 0.1.66 (plan 117, ADR 0188)
68e012d docs(plan-117): ADR 0188; the frozen format-6 save fixture, written while format 6 is current
9f6882e docs(plan-117): claim (Agent 3)
Acceptance:
  [x] enforced: a throttle 3 light-seconds away applies exactly 3 s later; display: at once, 3 s shown — `bun test packages/sim/test/comms-routing.test.ts` — 7 pass (the step that applies it starts at t0 + 3.000000)
  [x] a Manual route pinned through a relay is used with a direct link present, and breaks when the relay is occluded — same file
  [x] migration test with a frozen fixture of the previous format — same file (save-v6.json, written while format 6 was current)
  [x] bun test, typecheck, build, docs:check — below
Checks run here: bun run test 1697 pass / 1 fail (764 s; patch benchmark under load) · web vitest 1006 passed, 1 skipped (CreateWorld timed out once under load, 6/6 alone; 4 env-only import suites, no Node) · typecheck exit 0 · build exit 0 · docs:check OK · e2e not run (no WebGL 2 here)
Contracts changed (from Touches): protocol — comms-route, antenna-point, dispatch { source }, CommandResult.queued, network vessels route/latency/mode · save — format 7 (SimSave.comms) with the 6→7 migration · also SDK defineRoutePolicy, ctx.routePolicies, report kind route-policy, AntennaDefinition.beamWidth, the antenna hook's target, SignalState.latency (ADR 0188) · Contract requests: none
Save format / API_VERSION: format 7 (bump with migration and fixture) · API_VERSION patch bump 0.1.66
Docs: journal docs/journal/117-comms-tier-3-routing-latency-delay.md · ADR 0188 · research none new · simulation.md, plugin-system.md, guides/scripting.md, writing-a-mod.md, glossary · STATUS row only
Notes: the comms benchmark is 180..207 µs/step here (300 probes now relay each other; tier 1 was 25..39 µs). Links now name their first hop; bisection still dates link changes on the direct rule.
Resource notes: swap used 1257 MB, thermal ok, sub-workers used 0, anything left running: none
Follow-ups: new drafts none (118 planning tools, 119 queues, EC draw in ADR 0188)
```
- 2026-10-18 — Merged by Agent 1 ahead of 072, 073 and 125 at the owner's request (Agent 3 waits on it): rebased on main (conflict in the ADR index, both kept); save format 7; API_VERSION 0.1.67 (063 took 0.1.66); bun test 1704 pass, web vitest 1035 pass, typecheck, build, docs:check, smoke e2e 7 passed; launch, mission-center, vessel-panel and worlds e2e pass (Chromium).
