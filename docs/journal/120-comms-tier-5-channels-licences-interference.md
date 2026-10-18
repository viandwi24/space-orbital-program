# 120 — Comms tier 5: channels, frequency licences, interference, encryption

**Plan:** plans/120-comms-tier-5-channels-licences-interference.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode · **ADRs:** [0191](../decisions/0191-comms-channels-licences-interference-encryption.md) (new), [0101](../decisions/0101-communications-one-model-six-tiers-delay-off-by-default.md), [0185](../decisions/0185-comms-link-budget-bands-rate-ladder-inspector.md), [0188](../decisions/0188-comms-routing-pointing-capacity-latency-signal-delay.md) · **Research:** none new

**Status when written: criteria met here, handed over as `ready/120`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core` | `BandDefinition.channels` and `licence`; the budget's `interference`, `channel` and `encrypted`; `INTERFERENCE_DB`, `INTERFERENCE_CAP_DB`, `ENCRYPTION_OVERHEAD`, `DEFAULT_CHANNELS`, `DEFAULT_LICENCE`, `LICENCE_CAUSE`, `licensed`; the antenna hook's `channel` and `encrypted`; `SaveComms.licences` (optional); `licence-buy`; `channel`, `encrypted`, `interference` and `licences` in the network snapshot; `API_VERSION` 0.1.71 (main 0.1.69, 126 holds 0.1.70) |
| `packages/sim` | radios carry their channel and encryption; `bestBudget` records them; the interference and encryption pass after routing; `buyLicence`, `licenceRefusal`; `transmit-data` refuses an unlicensed channel |
| `mods/stock` | `setChannel` and `setEncrypted` on the antenna module, shown as part controls and in its snapshot; the rule `stock.comms-interference` |
| `apps/web` | Channel and Interference terms in the link inspector; the channel line and "Buy a licence for …" in the Comms tab |
| tests | `packages/sim/test/comms-channels.test.ts` (3); one web test, and the comms test helper gains the new fields |
| docs | ADR 0191; `simulation.md` gains "Comms tier 5"; the mod guide; the glossary |

## Decisions and deviations

- **Licences gate data, not links.** A probe on an unlicensed channel still links and takes commands; only `transmit-data` is refused. Channel 0 of each band is always licensed, so older worlds lose nothing.
- **Interference is a fixed 3 dB per interferer** (capped at 12 dB), compared only between first hops that share a band and a channel and reach each other's receiver: the cull of the plan's design note. A power-based ratio can replace the term later.
- **Channel and encryption are part actions,** not new commands: they live in the antenna module's state, so they save with the part, and like the antenna toggle they are never refused for lack of signal.
- **Encryption protects against agency interception** only as a flag for now; agencies do not listen yet (126 left jamming out).

## Measurements

- **Two whip probes** 2 000 km above the station and 50 km apart, both on channel 0: each loses exactly 3.0 dB of margin. Moving one to channel 1 restores the other's margin to the probe-alone value. With the rule off, neither loses anything.
- **Encryption:** the rate is 0.8 times the plain rate.
- **Comms benchmark** (300 probes, 10 bodies), back to back on this machine at one time: 381 µs per step with interference off and 424 µs with it on. Interference costs about 40 µs. The same benchmark measured 180 to 257 µs earlier the same day, so this laptop's thermal state moves it more than the code does. The budget is 500 µs on the M5. Interference counts each receiver's same-channel neighbours once per band and channel (O(edges)), not every pair of links.

## Follow-ups

- Agency interception and jamming.
- Power-based interference.
- Licence auctions on the markets.
- The licence price in the Comms tab button.

## Verification output

```text
bun run check:affected        prettier, docs:check, typecheck (11 workspaces + web) pass;
                              bun test of 10 workspaces: 1627 pass, 1 fail — the comms benchmark under the
                              suite's load (257 µs alone then; see Measurements)
bun test packages/sim/test/comms-channels.test.ts packages/sim/test/comms-routing.test.ts
         packages/sim/test/comms-queues.test.ts               16 pass after the O(edges) interference
bun run --filter @orbital/web test -- src/lib/comms src/lib/vessel-panel   11 passed
full suite                    CI on the ready/120 commit (ADR 0126)
```
