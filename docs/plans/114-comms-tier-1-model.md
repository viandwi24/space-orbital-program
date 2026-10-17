---
id: 114
title: "Comms tier 1: antennas, line of sight, ground stations, control states"
status: draft
owner: ""
depends: [084, 082]
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 114 — Comms tier 1: antennas, line of sight, ground stations, control states

## Goal

A stock comms plugin computes, deterministically in the sim Worker, which vessels have a link to a ground station: antenna modules with range, line of sight past bodies and terrain, ground stations from site buildings (or the site itself until 096), three control states (full, partial, none) applied according to the `controlWithoutSignal` rule (default full), and the plasma blackout dropping the link while the heating flux is over the badge level.

## Context

- ADRs: 0101
- Read: ADR 0101 points 1 to 4, ADR 0079, `refs/reverse-engineering-ksp2/beyond/01-communications-network-and-radio.md` §3 Tier 1 and §7 (git-ignored), `apps/web/src/lib/blackout.ts`.
- Draft 070 is the index of the comms plans.

## Scope

**In:**
- `defineAntenna` (range, power, kind), `defineGroundStation`; stock antennas (probe whip, dish).
- Network update on a 1 s sim-time cadence and on events; link up/down times under warp by bisection.
- Occlusion by bodies (segment against sphere) and by terrain near the ground (sampled height along the segment within a bound).
- Control state per vessel; commands refused per rule with a reason.
- Blackout from the sim's heating flux (moved from the page's display value to a sim value).
- `comms` contribution for other plugins; events `comms:link-up`, `comms:link-down`, `comms:control-changed`; snapshot `network` section.

**Out:** data rates (116), routing (117), UI (115).

## Touches

- **Size:** M
- **Edits:** `mods/stock`, `packages/sdk`, `packages/sim`, `packages/core`
- **Shared contracts:** **SDK (`defineAntenna`, `defineGroundStation`, comms events), protocol (snapshot `network`), save (antenna states)**

## Design notes

Cost budget: 0.5 ms average per step at 300 nodes and 10 bodies (M5); spatial cull by range.

## Steps

1. Antenna and station definitions.
2. Visibility and link model with tests.
3. Cadence and bisection.
4. Control states and blackout.
5. Benchmark.

## Acceptance criteria

- [ ] `packages/sim` test: a vessel behind the moon from the station loses the link at the time geometry gives (within 1 s at warp 1, within the bisection tolerance at warp 1e5).
- [ ] `packages/sim` test: with `controlWithoutSignal: none` a vessel without link refuses `throttle` with the reason; with `full` it accepts.
- [ ] `packages/sim` test: during a re-entry whose flux exceeds the badge level the link is down.
- [ ] Benchmark: 300 nodes, 10 bodies, under 0.5 ms average per step.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/114-comms-tier-1-model.md` written.
- [ ] `architecture/simulation.md` (comms), `plugin-system.md`, `guides/writing-a-mod.md` (antennas).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101).
- 2026-10-17 — Defaults updated by ADR 0109: control needs a command source (crew aboard or linked probe), `controlWithoutSignal` none in Career/Science and full in Sandbox, Career crew presets standard + hardcore.
