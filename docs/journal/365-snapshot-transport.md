# 365 — Snapshot transport

**Plan:** [plans/365-snapshot-transport.md](../plans/365-snapshot-transport.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0358](../decisions/0358-snapshot-deltas.md)

## What was done

`apps/web/src/lib/snapshot-delta.ts` (`SnapshotEncoder`, `SnapshotDecoder`), wired into `sim-host.ts` (posts the encoded snapshot) and `sim-client.ts` (decodes before the listeners); `snapshot-delta.test.ts` (roundtrip, same-object restore, smaller wire, a changed field and part, a part that moves to another vessel, a new and a gone vessel, a key that went and came back, a part without temperature); `scripts/measure-snapshot-transport.ts`.

## Findings

- A binary layout for the part transforms would not have helped: the structured clone of the transforms is a small part of the message (positions and orientations are 40 % of the parts' bytes, and the parts 47 % of the snapshot), and the consumers need objects, so the main thread would rebuild them in JS. What the message mostly carries is data that has not changed.
- Per vessel on the booster the message is 20 KB: parts 9.6, actions 2.7, bodies 3.0, sites 1.8, rules 0.8, resources 0.5.

## Numbers (M5, Chrome V8, the booster's snapshot grown to N vessels; main thread per message, clone plus decode)

| vessels (parts) | full | delta | bytes full → delta | worker encode |
|---|---|---|---|---|
| 1 (23) | 0.097 ms | 0.023 ms | 20 → 6 KB | 0.016 ms |
| 5 (115) | 0.321 ms | 0.103 ms | 76 → 31 KB | 0.052 ms |
| 20 (460) | 1.174 ms | 0.558 ms | 285 → 125 KB | 0.188 ms |

The message cost at 20 vessels halves (0.48×) and the bytes fall by 56 %. The vessels are copies of one real vessel, so their static data is the same size as real ones but their burn state is quiet.

## Not done

`profile-frame.ts` in the page with 20 real vessels (the script still clicks a removed button), and the allocation profile; a vessel burning engines sends its changed stores whole each tick (the delta does not help those parts).
