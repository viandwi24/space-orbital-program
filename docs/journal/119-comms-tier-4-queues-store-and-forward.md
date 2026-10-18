# 119 — Comms tier 4: transmission queues, store-and-forward, contact windows

**Plan:** plans/119-comms-tier-4-queues-store-and-forward.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode · **ADRs:** [0189](../decisions/0189-comms-transmission-queues-store-and-forward-contact-windows.md) (new), [0101](../decisions/0101-communications-one-model-six-tiers-delay-off-by-default.md), [0172](../decisions/0172-data-items-shape-ids-value-curve-and-storage.md), [0188](../decisions/0188-comms-routing-pointing-capacity-latency-signal-delay.md) · **Research:** none new

**Status when written: criteria met here, handed over as `ready/119`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core` | `SaveTransmission`, and `SaveComms.transmissions` in save format 8 with the 7 → 8 migration; `COMMAND_RATE`, `MAX_CUSTODY_HOPS`, `CONTACT_SCAN_STEP`; the `comms:data-delivered` event; the command `transmission-cancel`; `Snapshot.network.queues`; `API_VERSION` 0.1.68 (main is at 0.1.67) |
| `packages/sim/src/transmission.ts` (new) | `enqueueTransmission`, `cancelTransmission`, `stepTransmissions` (priority order, shared rate, the command rate, delivery, custody), `recoverQueued`, `queuesSnapshot` with arrival estimates, and the cached next contact |
| `packages/sim` | `routeNetwork` reports the neighbours of a vessel without a route; budgets at every sample while data is queued; transmissions step at each network sample; `nextDirectContact`, `hasAntenna`; `transmit-data` queues with comms on; `restoreData` |
| `mods/stock` | the data kind `stock.command` (priority −1) |
| `apps/web` | the Comms tab's "Sending" list: each item's share sent, its arrival or "Waits for a contact", the next contact, and Cancel |
| tests | `packages/sim/test/comms-queues.test.ts` (6); `fixtures/save-v7.json` and `make-save-v7.ts`; two science tests now turn comms off for the direct credit; the 117 migration test checks the current format; one web test |
| docs | ADR 0189; `simulation.md` gains "Comms tier 4"; the mod guide; the glossary |

## Decisions and deviations

- **A queued item leaves its storage** for the radio, so the panel cannot move or delete it while it is half sent. Cancel puts it back with its id, and the sent bits are lost.
- **Store-and-forward is custody to a relay with an earlier contact.**
  - The first draft asked the relay to have a route. But a relay with a route already gives the holder a route through it, so that never happened.
  - Custody now goes to a neighbour with storage whose next direct contact comes before the holder's own, which is what store-and-forward means.
  - The test covers it: a rover a quarter of the way round, and a relay passing over.
- **Bits per sample.** The time since the last network sample is spent at the rate of that sample. In flight that is every second, on rails at most 10 s apart, so windows are counted to within a sample. A 10 Mbit item at 1 kbit/s arrives within 20 s of 10 000 s of contact.
- **Budgets at every sample while data is queued.** Without queues, budgets stay at the last sample only (ADR 0185 point 8). Rates in a rails chunk are then right without slowing an empty network.
- **Science tests:** two tests of the direct credit (ADR 0178 point 7) now turn comms off. Their vessel has no antenna, and with comms on it can no longer transmit (ADR 0189 point 1).
- **No background closed form.** The plan's design note asked for background transmission. It falls out of the rails chunks' sampling, so there is no separate formula.

## Measurements

- **10 Mbit at 1 kbit/s:**
  - **First window:** about 6.0 Mbit sent in 6 000 s.
  - **The gap:** nothing moves for 3 000 s, and the next contact shows as unknown.
  - **Delivery:** about 4 000 s into the second window, within 20 s of 10 000 s of contact. 10 science is credited on arrival.
- **Preemption:** a 20 kbit command item queued behind a half-sent 5 Mbit bulk item goes first and arrives in 20 s, and the bulk item keeps its sent bits.
- **Comms benchmark:** 275 µs per step here with no data queued.

## Follow-ups

- 120: channels and licences.
- 118: the exact contact timeline.
- An EC cost per bit.
- Custody across several relays: one hop per update today, at most 8 in all.

## Verification output

```text
VERIFICATION
```
