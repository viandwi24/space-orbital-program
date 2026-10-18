# 0191 — Comms tier 5: channels, frequency licences, interference and encryption

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 120
**Builds on:** ADR 0101 tier 5, 0185 (bands and the budget), 0188 (routes and shared capacity), 0189 (transmission queues), 0190 (agencies).

## Context

Tier 5 divides bands into channels:

- operating on a channel needs a licence;
- links on one channel that see each other interfere;
- encryption costs rate.

Open questions:

- how many channels a band has;
- where a vessel's channel is chosen;
- what a licence gates;
- how interference is counted without a full radio simulation;
- what encryption protects against before agencies can listen.

## Decision

1. **Channels.** `BandDefinition.channels` (default 4) numbers a band's channels 0 to n − 1, and `BandDefinition.licence` (funds, default 5 000) is the price of one licence.
   - **On a vessel:** each antenna module's state holds `channel` (default 0) and `encrypted` (default false).
   - **The actions:** the stock antenna module offers `setChannel` (a value action) and `setEncrypted` (a toggle). They are part actions, never refused for lack of signal.
   - **Stations:** they listen on every channel.
2. **Licences.** Channel 0 of every band is licensed in every world, so older worlds keep transmitting. `licence-buy { band, channel }` buys another one, booking the price (cause `comms.licence`) when the economy is on; without the economy it is free.
   - **What it gates:** data. With comms on, `transmit-data` from a vessel whose transmitting antenna is on an unlicensed channel is refused (`no licence for <band> channel <n>`).
   - **What it does not gate:** links and commands, which still work, so a probe is never lost to paperwork.
   - **Save:** licences are kept in `SimSave.comms.licences` (optional, no bump).
3. **Interference** (rule `stock.comms-interference`, on by default). After routing, every routed vessel's first hop is checked against the other routed transmitters on the same band and channel.
   - **An interferer** is another vessel on the same band and channel whose position would link to the same receiver (range and line of sight, ADR 0179). It costs 3 dB of margin; the total is capped at 12 dB.
   - **Where it shows:** the first-hop budget gains an `interference` term (dB), and the inspector names it.
   - **The rate:** the first-hop margin and rate fall, and the route's width is the smaller of its old width and that rate before capacity sharing.
   - **The cull** of the plan's design note: only links that share a band and a channel are compared, and only against receivers they could reach.
4. **Encryption.**
   - **The cost:** an encrypted first hop sends at 0.8 times its rate (`ENCRYPTION_OVERHEAD`), applied with the interference.
   - **The protection:** encryption protects the link against agency interception (ADR 0101). That is a flag on the snapshot today, since agencies do not listen yet (126 left jamming and interception out).
5. **Snapshot.**
   - each network vessel gains `channel`, `encrypted` and `interference` (dB);
   - `Snapshot.network.licences` lists the licensed `{ band, channel }`;
   - the Comms tab shows the channel, a licence button, and the encryption switch through the part's own controls.

## Alternatives considered

- **A signal-to-interference ratio from every transmitter's power:** rejected for now. A fixed loss per interferer is readable in the inspector and testable, and the cull keeps it cheap. A power-based model can replace the term later without changing the snapshot.
- **Licences gating links:** rejected. Losing a probe because a licence was not bought would be harsh. Data is what the regulator cares about.
- **A channel per vessel instead of per antenna:** rejected. An antenna is the radio, and two antennas can work on two channels.

## Consequences

- **Mod API:**
  - `BandDefinition.channels` and `licence`;
  - the antenna hook's `channel` and `encrypted`;
  - additive, with an `API_VERSION` patch bump.
- **Protocol:**
  - `licence-buy`;
  - `channel`, `encrypted` and `interference` on network vessels;
  - `Snapshot.network.licences`;
  - the refusal of `transmit-data`.
- **Save:** an optional field. Channel choices are module state.
- **Rule:** `stock.comms-interference`.
- **Follow-ups:**
  - agency interception and jamming;
  - power-based interference;
  - licence auctions with markets.
