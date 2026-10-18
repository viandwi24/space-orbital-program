# 0193 — Comms tier 6: suit radios relayed by crewed vessels, the radio ability, fine terrain sampling, live broadcasts of firsts

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 121
**Builds on:** ADR 0101 tier 6 (suit radios, voice, live broadcasts), 0179 (links, the terrain test), 0188 (routing), 0189 (data delivery), 0120 (EVA suits), 0176 (crew abilities), 0147 (milestones and their reputation).

## Context

Plan 121 adds crew suit radios relayed by their lander or rover, a crew radio stat, voice and live broadcasts. Open questions:

- what makes an antenna a suit radio, and what it may link to;
- how a crew stat acts on it;
- how a ridge 200 m away cuts the link at the right place;
- what a broadcast needs and pays.

## Decision

1. **A suit radio is an antenna with `suit: true`.** A vessel whose enabled antennas are all suit radios is a suit node, and it behaves differently from other vessels:
   - It links only to a crewed vessel that is not a suit node: never to a station, a probe or another suit.
   - It reaches as far as its own radio's range rating, not the geometric mean of tier 1, so a suit radio stays short-ranged whatever the lander carries.
   - A crewed vessel hears its suits on the suit radio: the edge's budget uses the suit's antennas at both ends, so a lander relays its suits whatever bands it carries.
   - It is not a control point, so its route ends at the crewed vessel it relays through.
   - Nobody routes through it.

   The stock suit radio is `stock.suit-radio`: UHF, omni, 0.5 W, range rating 2 km. It sits on the EVA suit as a `stock.antenna` module.

2. **The radio ability.** Crew abilities gain `radio` (default 1; engineers start at 1.1, plus 0.05 per level, × traits). A suit radio's range rating is multiplied by the highest `radio` ability among the members aboard the suit. A better radio operator closes a link at a weaker signal.

3. **Fine terrain sampling at short range.** An edge with a suit node samples the terrain every `SUIT_SAMPLE_SPACING` (1 m), at least the tier 1 count (16), using the same height test. A ridge between the suit and the lander therefore cuts the link at the geometric line of sight, to within a metre. Other edges keep 16 samples, so the network's cost does not change.

4. **Voice** is the stock data kind `stock.voice`, already registered with priority 1 (after commands, before science), so it moves through the queues of ADR 0189 like any data item.

5. **Broadcasts.** `comms-broadcast { milestone }` broadcasts a world first live. It is accepted when all of these hold:
   - comms are on;
   - the milestone was reached within `BROADCAST_WINDOW` (3 600 s);
   - it has not been broadcast yet;
   - its vessel still exists;
   - its vessel reaches the ground at a rate of at least `BROADCAST_RATE` (10⁵ bit/s). For a suit, the chain runs on through the crewed vessel it relays through, and the rate is the lowest along it.

   It books `BROADCAST_FACTOR` (0.5) × the milestone's reputation (`milestoneReputation`) as `comms.broadcast`, with the milestone id as ref, when the economy is on.
   - Each refusal says why.
   - The broadcast ids save as `SaveComms.broadcasts` (optional, no format bump).
   - `Snapshot.network.broadcasts` lists the open offers: milestone, label, vessel, until, and the rate the vessel has now.

6. **UI.**
   - The crew panel shows the vessel's signal bars on each row.
   - The EVA section shows the suit radio's bars, the vessel it relays through, and why it is cut.
   - The HUD offers a Broadcast button for each open offer.

## Consequences

- A rover or a lander with seats relays its suits. A probe does not, which matches ADR 0101's "relayed by their lander or rover".
- A suit out of sight of its lander cannot send data. Its link reason is the tier 1 reason (`blocked by terrain`, `out of range`). Its control stays full, because the suit is crewed.
- Radio astronomy with big dishes is still out of scope (plan 121).
