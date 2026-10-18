# 121 — Comms tier 6: suit radios, voice and live broadcasts

**Plan:** plans/121-comms-tier-6-suit-radios-voice-broadcast.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode · **ADRs:** [0193](../decisions/0193-comms-tier-6-suit-radios-broadcasts.md) (new), [0101](../decisions/0101-communications-one-model-six-tiers-delay-off-by-default.md) tier 6, [0100](../decisions/0100-crew-a-full-simulation-every-aspect-a-world-rule.md), [0179](../decisions/0179-comms-tier-1-links-stations-control-blackout.md), [0188](../decisions/0188-comms-routing-pointing-capacity-latency-signal-delay.md), [0120](../decisions/0120-eva-the-suit-is-a-vessel-commands-walking-jetpack-flag.md), [0176](../decisions/0176-crew-roster-places-xp-seats-death-salaries.md), [0147](../decisions/0147-milestones-in-the-sim-achievements-in-the-page.md) · **Research:** none new

**Status when written: criteria met here, handed over as `ready/121`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core` | `AntennaDefinition.suit`; `SUIT_SAMPLE_SPACING`, `BROADCAST_WINDOW`, `BROADCAST_RATE`, `BROADCAST_FACTOR`, `BROADCAST_CAUSE`; the crew ability `radio` (engineers 1.1); the command `comms-broadcast`; `Snapshot.network.broadcasts`; `SimSave.comms.broadcasts` (optional); `API_VERSION` 0.1.73 (120 took 0.1.71, 129 0.1.72) |
| `packages/sim/src/comms.ts` | suit nodes: links only with crewed non-suit vessels, their own range × the `radio` ability, the suit's antennas at both ends of the budget, no control point, nobody routes through them; terrain sampled every metre on a suit's edges |
| `packages/sim/src/broadcast.ts` (new) | `broadcastMilestone` (window, once, the ground rate through a suit's relay, the reputation) and `broadcastOffers` |
| `mods/stock` | `stock.suit-radio` (UHF, omni, 0.5 W, 2 km) on the EVA suit |
| `apps/web` | `comms/suit-radio.ts` (`linkBars`, `suitRadio`, `broadcastOffers`). The crew card's `radio`. The crew panel: the rows' bars (the "no radio" placeholder of plan 108 is gone), the EVA section's suit radio (bars, via, reason), and the Broadcast live offers. `FlightHud.broadcasts` and the suit radio refresh with the model |
| tests | `packages/sim/test/comms-suit.test.ts` (4); `crew-card.test.ts` (+2); boot and crew core tests updated for the new antenna and ability |
| docs | ADR 0193; `simulation.md` "Comms tier 6"; `plugin-system.md`; the guide; the glossary |

## Decisions and deviations

- **A suit reaches only as far as its own radio.** Tier 1's geometric mean would let a 2 km suit radio reach 30 km from a lander with a whip antenna.
- **A crewed vessel hears its suits whatever bands it carries.** The edge's budget uses the suit's antennas at both ends. Without this, a lander with only an S-band whip would relay its UHF suits at "commands only".
- **The broadcast rate is to the ground.** A suit's own route ends at its lander, which is a control point. The rate therefore follows the chain on through the lander to a station, and the lowest rate counts. A lander on the moon's far side cannot broadcast.
- **The geometric point.** The test's wall ends 20 m north of the line at 100 m east, so a suit at 200 m east sees past it from 40 m north. With 1 m sampling, the link switches between 39 and 41 m. With tier 1's 16 samples (12.5 m apart), it would switch near 37.6 m. Only a suit's edges sample finely, so the network's cost elsewhere is unchanged.
- **The radio ability** is unit-tested in core (the key list). There is no sim test of a suit walking 2 km, which would take about 20 minutes of sim time at walking speed.
- **Voice** was already the stock data kind `stock.voice` (plan 119), so no change was needed.

## Follow-ups

- Radio astronomy with big dishes, out of scope here, as the plan says.

## Verification output

See the handover tag `ready/121`. The checks are `bun run check:affected` here, and the full suite in CI (ADR 0126).
