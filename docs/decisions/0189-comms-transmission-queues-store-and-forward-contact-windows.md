# 0189 — Comms tier 4: transmission queues, store-and-forward custody, delivery and contact windows

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 119
**Builds on:** ADR 0101 tier 4, 0099 point 2 (data is transmitted through comms when comms is on, directly at the same factor when it is off), 0172 (data items, kinds, priorities and value curves), 0178 point 7 (`transmit-data`), 0188 (routes, shared rates, the network cadence).

## Context

`transmit-data` credits a science item at once. Tier 4 makes data travel:

- a queue on the sending vessel;
- the route's shared rate;
- custody at a relay when the onward route is down;
- a delivery event;
- the time the next contact is expected.

Open questions:

- where a queued item lives;
- how the bits are counted between samples;
- what store-and-forward means in a graph that routes end to end;
- how priorities preempt;
- how far ahead a contact is looked for;
- what is saved.

## Decision

1. **A queued item leaves its storage.** With comms on, `transmit-data { vessel, item }` moves the item from the vessel's data storage into its transmission queue: the radio holds it. With comms off it credits at once, as before (ADR 0099 point 2).

   The command is refused when the vessel has no antenna. `transmission-cancel { vessel, item }` puts a queued item back into storage if there is room, otherwise it is refused. The sent bits of a cancelled item are lost.
2. **Queues.** `SimCore.commsState.transmissions` holds `{ seq, holder, origin, item, sent }`:
   - `holder` is the vessel that has the item now;
   - `origin` is the vessel that sent it first;
   - `sent` is the bits already gone from the holder.

   A holder sends its queue in kind priority order (lower first), then `seq`. Stock adds `stock.command` with priority −1, so a command item preempts queued bulk data from the next bit on. Preemption happens between updates: an item already half sent keeps its sent bits.
3. **Bits per update.** At each network sample, the time since the last sample is spent on the holder's queue:
   - when the holder has a route, at its shared rate (ADR 0188 point 4);
   - else, when it has custody (point 4), at that edge's rate.

   A rate of 0 ("commands only") moves only command items, at 1 kbit/s. This runs at the cadence of ADR 0179 point 4: every second in flight, at most 10 s apart in rails chunks. So vessels on rails transmit in the background through the same sampled windows. A contact that only falls between two samples is lost, at most 10 s of it.
4. **Store-and-forward custody.** A holder without a route but with an edge to a vessel that has data storage hands its head item over, if that vessel's free storage fits the item. The receiver must expect its next direct contact (point 6) before the holder's own, or the holder must expect none. A relay that already had a route would have given the holder a route through it. Custody moves item by item:
   - the item's remaining bits are sent over that edge;
   - the item then joins the relay's queue, and `holder` becomes the relay;
   - the item is counted against the relay's free storage while it is held.

   Items never hop more than 8 times, so a broken network cannot pass them around forever.
5. **Delivery.** When a holder with a route has sent all of an item, it is delivered:
   - `comms:data-delivered { vessel: origin, item, time }` is emitted;
   - a science item credits `dataValueAt(kind, item, t) × transmitFactor` (`how: 'transmitted'`), so aging counts.
6. **Contact windows.** For each holder without a route, at most every 60 s of sim time, the sim looks for the next time it links directly to a station or a crewed vessel.
   - It samples the rails motion forward, every 60 s up to one day of the home body.
   - The result, `nextContact` (sim time, or null when none is found within the day), is cached until it passes.
   - `Snapshot.network.queues` lists each holder's items with `{ id, kind, bits, sent, eta }`. `eta` is the delivery time if the current rate held from now (or from `nextContact`), and null when unknown.
7. **Save format 8.** `SimSave.comms.transmissions` is saved; the contact cache is not. The migration from 7 adds `transmissions: []`, and the frozen fixture `save-v7.json` proves it.

## Alternatives considered

- **Leaving queued items in storage:** rejected. A queued item that can still be moved or deleted from the panel would need locks. Moving it into the radio's queue is how a player reads "it is being sent".
- **Hop-by-hop custody for every route:** rejected. With an end-to-end route the rate is already the route's bottleneck. Custody matters only when the onward route is down.
- **Exact contact windows (root finding on the link rule):** deferred. A 60 s scan over one day is cheap and good enough for an estimate. Planning tools (118) will show windows exactly.

## Consequences

- **Mod API:** the `stock.command` data kind; `comms:data-delivered` (already listed by ADR 0101) is now emitted. Additive, with an `API_VERSION` patch bump.
- **Protocol:**
  - `transmit-data` queues when comms is on;
  - the command `transmission-cancel`;
  - `Snapshot.network.queues`.
- **Save:** format 8 with a migration.
- **Behaviour:** with comms on, transmitted science arrives after its bits are sent, not at once. A vessel without an antenna can no longer transmit while comms is on.
- **Follow-ups:**
  - channels and licences (120);
  - an exact contact timeline (118);
  - an EC cost per bit.
