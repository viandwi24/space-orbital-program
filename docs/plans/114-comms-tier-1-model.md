---
id: 114
title: "Comms tier 1: antennas, line of sight, ground stations, control states"
status: in-progress
owner: "Agent 3"
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
- `defineAntenna({ id, label, kind, range, power })` and `defineGroundStation({ id, label, body, latitude, longitude, altitude?, range })` (registries, SDK). Module `stock.antenna` (config `{ antenna }`, state `{ enabled }`, toggle action). Stock antennas: a probe whip and a dish; a stock probe core part (control source, no seats) with a whip built in.
- Ground stations: every world site is one, its range from the tier of an active `comms-node` building (tier 1 without one, until 096); plus registered stations.
- Link model (direct links only; relays are 117): a vessel with an enabled antenna links to a ground station or a vessel with a crewed command part when the distance is under `√(range_a × range_b) × stock.comms-scale`, the segment misses every body sphere and, near the ground, the terrain, and the vessel is not in plasma blackout. The strongest antenna counts.
- Network update every 1 s of sim time and at once on staging, an antenna toggle, an SOI change and vessel creation or removal. Under warp, samples at most 10 s apart and link up/down times by bisection on rails positions.
- Control: ADR 0109's command source for probes. A vessel whose only command sources are probe cores (control-source parts without seats) and that has no link is controlled per `stock.control-without-signal`: `full`, `partial` (throttle and attitude refused) or `none` (throttle, attitude, SAS, staging, actions and action groups refused), each refusal with the reason. `stock.comms` off: no network, full control.
- Blackout from the sim: the blackout law (ADR 0079) moves to `@orbital/core`, the renderer re-exports it, and the sim drops the link while the vessel's level is at or above the badge level.
- `ctx.vessel.signal()` for modules (the contribution other plugins read); events `comms:link-up`, `comms:link-down`, `comms:control-changed` with the bisected `time`; `Snapshot.network` (stations and per-vessel link, reason, control, blackout).
- Save: antenna on/off is module state; links are derived and recomputed on resume (no format change).

**Out:** data rates and bands (116), routing and relays (117), UI and the map's Network layer (115), signal delay and `flight-computer` (later tiers), crew needed in a crewed command part (stays "counts as crewed" until the launch flow seats crew, plan 108; ADR 0179), EC draw of antennas (116).

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

- [x] `bun test packages/sim/test/comms.test.ts`: a probe orbiting the moon loses the link when the moon comes between it and every station, at the time the snapshot geometry gives within 1 s at warp 1, and within 1 s at warp 1e5 (bisection).
- [x] Same file: with `stock.control-without-signal` `none` a probe without link refuses `throttle` with the reason; with `full` it accepts; a crewed pod is never refused.
- [x] Same file: during a re-entry whose flux exceeds the badge level the link is down with reason `plasma blackout`.
- [x] Same file, `-t benchmark`: 300 nodes and 10 bodies, under 0.5 ms average per step (indicative here; M5 by Agent 1).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/114-comms-tier-1-model.md` written.
- [x] `architecture/simulation.md` (comms), `plugin-system.md`, `guides/writing-a-mod.md` (antennas).
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101).
- 2026-10-17 — Defaults updated by ADR 0109: control needs a command source (crew aboard or linked probe), `controlWithoutSignal` none in Career/Science and full in Sandbox, Career crew presets standard + hardcore.
- 2026-10-17 — Refined and claimed by Agent 3. Tier 1 links are direct (station or crewed vessel); relays wait for 117. Like science (103), the network engine is in the sim and the content (antennas, stations, rules) in stock, because links must refuse commands at the sim boundary; modules read it through `ctx.vessel.signal()`. A crewed command part still counts as crewed without crew until the launch flow seats crew (108). Design choices go in ADR 0179.
- 2026-10-17 — Implemented by Agent 3 and handed over as `ready/114`. The engine is in the sim, with ADR 0179 point 8. Antenna actions are never refused. The snapshot computes the network fresh while it is dirty. The web badge still computes its own level, with the same law now from core. Benchmark: 25 to 39 µs per step for 300 nodes and 10 bodies here. Journal: `journal/114-comms-tier-1-model.md`.
