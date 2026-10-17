# 114 — Comms tier 1: antennas, line of sight, ground stations, control states

**Plan:** plans/114-comms-tier-1-model.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-17), three-agent team mode · **ADRs:** [0179](../decisions/0179-comms-tier-1-links-stations-control-blackout.md) (new), [0101](../decisions/0101-communications-one-model-six-tiers-delay-off-by-default.md), [0109](../decisions/0109-control-needs-a-command-source-like-ksp-career-crew-preset-and-10px-text.md), [0079](../decisions/0079-plasma-blackout-is-a-display-of-the-heating-flux.md) · **Research:** `refs/reverse-engineering-ksp2/beyond/01-communications-network-and-radio.md` §1, §3 Tier 1 and §7 (git-ignored); no new research note

**Status when written: criteria met here, handed over as `ready/114`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/comms.ts` (new) | `AntennaDefinition`, `GroundStationDefinition`, schemas, station ranges and mast, `COMMS_RULES`, control states, `LinkReason`, `SignalState`, `linkRange`; the blackout law moved from the renderer |
| `packages/core` | registries `antennas`, `groundStations`, `ctx` registrars, report kinds; module hook `antenna`; `VesselApi.signal()`; events `comms:link-up/link-down/control-changed`; `Snapshot.network`; `API_VERSION` 0.1.40 |
| `packages/sim/src/comms.ts` (new) | stations from sites and definitions, nodes, line of sight (spheres, terrain samples), blackout, cadence, sampling and bisection, control states and refusals, the snapshot |
| `packages/sim` | `SimCore.comms`; the update after each step and rails chunk; refusals in `throttle`, `attitude`, `sas`, `stage`, `action`, `action-group`; stations reset on building and site changes |
| `packages/renderer` | `reentry.ts` re-exports the blackout law from core |
| `mods/stock` | antennas whip and dish, `stock.antenna`, parts probe core (whip built in), whip antenna, dish antenna |
| tests | `packages/sim/test/comms.test.ts` (5); stock boot list |
| docs | ADR 0179, `simulation.md`, `plugin-system.md`, guide "Antennas and ground stations" |

## Decisions and deviations

- **The engine is in the sim, the content in stock** (ADR 0179 point 8), as for science. ADR 0101 point 1 wanted a stock plugin on the SDK, but a system cannot refuse commands or see rails positions and terrain.
- **Crewed pods without crew still count as crewed** (point 6). The launch flow seats nobody yet, so ADR 0109's crew half waits for 108.
- **Direct links only:** to a station, or to a vessel with a crewed command part and an antenna. Relays are 117.
- **Antenna actions are never refused,** or a probe that switched its antenna off could never get its signal back.
- **The snapshot computes the network fresh while it is dirty** and does not store it. So whether a host asks does not move the update cadence.
- **The web blackout badge is unchanged:** it still computes its own level, with the same law now from core. Moving the HUD to `Snapshot.network` is UI work (115).

## Measurements

- Benchmark: 300 probes on rails around home, 10 bodies (8 fixture moons), network on against off: median 25 to 39 µs per step here (budget 500 µs; indicative, M5 by Agent 1). A first run at the same time as the whole sim suite showed 0.8 ms, so the median of three pairs is the measure.
- Moon occlusion at warp 1: the event is dated by bisection, well within 1 s of the step at which the snapshot geometry first shows the moon in the way. At warp 1e5 one step jumps past it and the event still lands within 1 s.

## Follow-ups

- 115: the HUD signal and the map's Network layer from `Snapshot.network`; the badge from the sim's blackout. 116: link budget, bands, combined antennas, EC draw. 117: relays and routing. 108: crew required in crewed command parts. Signal delay and `flight-computer` (later tiers).

## Verification output

```text
bun test packages/sim/test/comms.test.ts          5 pass (benchmark 25 µs/step alone, 34 µs in the full run)
bun run docs:check                                exit 0
bun run test                                      1485 pass, 0 fail (288 s)
bun run typecheck                                 exit 0 (70 s)
bun run build                                     exit 0 (6 s)
bun run --filter @orbital/web test                901 passed, 1 skipped; 3 env-only import suites (no Node here);
                                                  CreateWorld.test.ts timed out once under load, passes 3/3 alone (flaky, plan 092's)
```
