# 116 — Comms tier 2: link budget, bands, data rates, comms scale

**Plan:** plans/116-comms-tier-2-link-budget.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode · **ADRs:** [0185](../decisions/0185-comms-link-budget-bands-rate-ladder-inspector.md) (new), [0101](../decisions/0101-communications-one-model-six-tiers-delay-off-by-default.md), [0179](../decisions/0179-comms-tier-1-links-stations-control-blackout.md), [0158](../decisions/0158-comms-interface-link-badge-comms-tab-network-overlay.md) · **Research:** [`docs/research/comms.md`](../research/comms.md) (new)

**Status when written: criteria met here, handed over as `ready/116`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/comms.ts` | `BandDefinition` and schema; the antenna fields `band`, `gain` and `aperture`, and the station field `aperture`; `SITE_STATION_APERTURES`; `SignalState.rate`. The budget as pure functions: `freeSpaceLoss`, `dishGain`, `antennaGain`, `linkBudget`, `rateForMargin`, plus `RATE_LADDER`, `LINK_EB_N0`, `DISH_EFFICIENCY` and the physical constants |
| `packages/core` | the `bands` registry, `ctx.bands` and report kind `band`; the command `comms-inspect`; `rate` and `margin` on `Snapshot.network.vessels`, and `Snapshot.network.inspector`. `API_VERSION` 0.1.60: 096 took 0.1.58 and the crew-dismiss contract took 0.1.59 |
| `packages/sdk` | `defineBand`; the budget functions re-exported |
| `packages/sim/src/comms.ts` | the station aperture; each node's working antennas; `bestBudget`, the best transmitter and receiver pair on a common band; the budget at each update's last sample (not in the bisection); `signalOf().rate`; the snapshot's rate, margin and inspector |
| `packages/sim/src/commands.ts` | `comms-inspect`: view state, never refused |
| `mods/stock` | the five bands (UHF, S, X, Ka, optical). The whip is S band at 2 dBi; the dish is X band with a 1 m aperture |
| `apps/web` | `barsForRate`, `rateText`, `budgetTerms` and `bandLabel` in `comms/network-model.ts`. The Comms tab shows the rate and a "Link budget" list of every term, and sends `comms-inspect` while it is open. The badge and the tab take their bars from the rate |
| tests | `packages/core/test/comms-budget.test.ts` (4), `packages/sim/test/comms-budget.test.ts` (4), two web tests (the rendered inspector, bars and words); the SDK loader's report kinds |
| docs | ADR 0185; the research note `comms.md`; `simulation.md` gains "Comms tier 2"; `plugin-system.md`; the guide's "Bands and data rates"; the glossary |

## Decisions and deviations

- **The tier-1 rule still decides the link; the budget gives the rate** (ADR 0185 point 4).
  - In the small stock system a real budget reaches about 100 times further than the gameplay ratings. Making the budget the rule would rebalance every tier-1 test and design.
  - A link below the ladder stays up as "commands only".
  - Reconciling the two belongs to 117 (relays, capacity).
- **"On request" is a command,** `comms-inspect`. The panel sends it while the Comms tab is open. Every vessel carries only two numbers, `rate` and `margin`.
- **One noise temperature per band** and one required Eb/N0 (3 dB) keep the inspector readable.
- **Optical uses an effective noise temperature,** so one formula covers every band (research note).
- **No new parts.** The stock whip and dish get S and X. UHF, Ka and optical are registered for mods and for 117's relay parts.
- **Edits outside the plan's listed web folder:** the Comms tab lives in `lib/vessel-panel` and `lib/comms` (plan 115), not `lib/hud`.

## Measurements

- The hand calculation (research note, "Worked case") matches `linkBudget` to under 0.001 dB in every term.
- In the sim, two probes 2 000 km and 4 000 km above the first station differ by 6.02 dB in margin (to 0.005 dB). Their rates are 1 Gbit/s and 100 Mbit/s, on either side of the 60 dB mark. Setting `stock.comms-scale` to 2 gains 6.02 dB.
- Cost: one budget per linked vessel per update. The tier-1 benchmark (300 nodes, 10 bodies) still passes in the suite (see below).

## Follow-ups

- 117: relays, routing and capacity sharing, the budget as the link rule, and combined antennas.
- Parts on UHF, Ka and optical.
- EC draw by transmit power.
- Band labels from the registry on the page, instead of the stock table in `bandLabel`.

## Verification output

```text
bun test packages/core/test/comms-budget.test.ts packages/sim/test/comms-budget.test.ts   8 pass
bun test packages/sim/test/comms.test.ts          tier-1 suite incl. the 300-node benchmark: pass
bun run docs:check                                docs-check: OK (135 plans, 157 ADRs)
bun run test                                      1637 pass, 4 fail (551 s) — all four timeouts under load
                                                  (scripted ascent wall time, re-entry and tower determinism,
                                                  waking up); the four files alone: 34 pass, 0 fail (21 s)
bun run typecheck                                 exit 0 (web: 1743 files, 0 errors)
bun run --filter @orbital/web test                989 passed, 1 skipped; 4 env-only import suites fail here
                                                  (editor-options, settings, WarpControl, dock: no Node)
bun run build                                     exit 0
```
