# 0185 — Comms tier 2: bands, the link budget, the rate ladder, the comms scale and the inspector

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 116
**Builds on:** ADR 0101 tier 2 and point 4 (`commsScale`), 0179 (tier 1: antennas, stations, the link rule), 0158 (the Comms tab and the link badge).

## Context

Tier 1 says whether a vessel has a link. Tier 2 adds how much data the link carries: a Friis link budget per band, mapped to a ladder of rates, with a per-world comms scale and an inspector that names every term. Open questions:

- what a band and an antenna carry;
- what a ground station receives with;
- whether the budget or the tier-1 rule decides that a link exists;
- which way the budget runs;
- where the scale applies;
- what the ladder is;
- how the inspector gets its data without making every snapshot heavier.

## Decision

1. **Bands.** `defineBand({ id, label, frequency, noiseTemperature })`:
   - `frequency` is in Hz;
   - `noiseTemperature` is the receiving system's noise temperature in K, used for every receiver on the band.

   Stock registers UHF (401 MHz, 300 K), S (2.25 GHz, 100 K), X (8.45 GHz, 50 K), Ka (32 GHz, 80 K) and optical (1550 nm, 193.4 THz, 10 000 K effective). The values are in `docs/research/comms.md`.
2. **Antenna fields** (all optional, so tier-1 antennas keep loading):
   - `band`: a band id;
   - `gain`: dBi;
   - `aperture`: dish diameter, m.

   The gain on a band is `gain` if set. Otherwise, with an `aperture`, it is the dish gain `10·log10(η·(π·D·f/c)²)` with η = 0.55. Otherwise it is 2 dBi.

   An antenna without a known band has no budget: its link works as in tier 1, and its rate is `null`. Stock: the whip is S band at 2 dBi and 5 W; the dish is X band with a 1 m aperture and 50 W.
3. **Stations receive on every band** with a dish:
   - a site's aperture by tier is 10, 34 or 70 m;
   - a registered station takes `aperture` (default 10 m).
4. **The tier-1 rule still decides the link.** Range ratings, line of sight and blackout stay exactly as ADR 0179 point 3. The budget gives the link's rate and margin.

   A link whose budget is below the ladder's first step stays up with rate 0 ("commands only"). Commands are tiny, and the ratings are the balance of tier 1. Making the budget the link rule is deferred to 117, where relays and shared capacity need it anyway.
5. **The budget is the downlink**, from the vessel to its endpoint:
   - the vessel's transmitter is the enabled, working antenna with a known band that gives the best margin;
   - the receiver is the station's dish on that band, or, for a vessel endpoint, that vessel's best antenna on the same band;
   - two vessels without a common band have rate 0 and the budget says so (`band: null`).

   The terms, in order:
   - transmit power (dBW);
   - transmit gain;
   - distance;
   - comms scale;
   - effective distance;
   - free-space loss `20·log10(4π·d·f/c)`;
   - receive gain;
   - received power;
   - noise temperature;
   - noise density `10·log10(k·T)`;
   - C/N0;
   - required Eb/N0 (3 dB, one constant);
   - margin;
   - rate.
6. **The comms scale** (`stock.comms-scale`, already a range factor in tier 1) divides the distance in the budget: `d_eff = d / scale`. A scale of 2 reaches twice as far at the same rate, in both the rule and the budget.
7. **The rate ladder** runs in decades from 1 kbit/s to 1 Gbit/s (`RATE_LADDER`, 7 steps).
   - The **margin** is the margin at the first step: `C/N0 − Eb/N0 − 10·log10(1000)`, in dB.
   - The **rate** is `1000 · 10^floor(margin / 10)` bit/s, capped at 1 Gbit/s, or 0 below a margin of 0.

   Doubling the distance lowers the margin by 6.02 dB, and the rate steps down at each multiple of 10 dB.
8. **Where it lives.**
   - **Pure functions in `@orbital/core`:** `freeSpaceLoss`, `dishGain`, `antennaGain`, `linkBudget`, `rateForMargin`.
   - **The sim** computes the budget at each network update, at the update's last sample only. Bisection still runs on the tier-1 rule.
   - `ctx.vessel.signal()` gains `rate` (bit/s or null).
9. **Snapshot and the inspector.**
   - Every `Snapshot.network.vessels` entry gains `rate` and `margin`, which are `null` without a budget.
   - A command `comms-inspect { vessel | null }` picks one vessel. Its full budget is then carried as `Snapshot.network.inspector = { vessel, to, budget }` until the pick changes.
   - The pick is view state: it is never saved and is never refused.
   - The Comms tab sends the command while it is open. It lists each term with its value and unit. The signal bars follow the rate: 1 bar below 10 kbit/s, 2 bars below 1 Mbit/s, 3 bars below 100 Mbit/s, otherwise 4.

## Alternatives considered

- **The budget as the link rule now:** rejected for now (point 4). The stock ratings are gameplay-tuned, and real budgets in the small stock system reach about 100 times further. Reconciling the two is 117's capacity work.
- **The full budget for every vessel in every snapshot:** rejected. That would be about 14 numbers per vessel per frame. A command for the one vessel the player looks at is cheap.
- **A gain per band on each antenna:** rejected. An aperture gives every band's gain from one number, and fixed-gain antennas set `gain`.
- **A noise temperature per receiver:** deferred. One per band is enough for a readable inspector.

## Consequences

- **Mod API:**
  - `defineBand`;
  - the antenna fields `band`, `gain` and `aperture`;
  - the station field `aperture`;
  - `SignalState.rate`;
  - the load-report kind `band`.

  All additive, with an `API_VERSION` patch bump.
- **Protocol:**
  - the command `comms-inspect`;
  - `rate` and `margin` on each network vessel;
  - `Snapshot.network.inspector`.

  The save format is unchanged.
- **Follow-ups:**
  - 117: relays, capacity sharing, the budget as the link rule, and combining several antennas;
  - parts on UHF, Ka and optical;
  - EC draw by transmit power.
