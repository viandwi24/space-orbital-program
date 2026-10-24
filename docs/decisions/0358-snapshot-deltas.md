# 0358 — Snapshot deltas: the worker posts only what changed

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/365-snapshot-transport.md
**Builds on:** ADR 0016 (the worker protocol), plan 363's research

## Context

The sim worker posts a full `Snapshot` every tick (about every 16 ms) and the main thread pays to deserialize all of it in `worker.onmessage`. Most of it does not change between ticks: the bodies, sites, rules and other world blocks, a vessel's actions and crew, and per part its definition, modules, stores and limits. On the booster (23 parts) a message is 20 KB and 0.10 ms; grown to 20 vessels of 23 parts it is 285 KB and 1.17 ms.

## Decision

1. **Deltas, not binary.** A binary layout for the transforms alone would not help: the consumers need the `Snapshot` objects, so the main thread would rebuild them from arrays (JS work) in place of the native deserializer. Instead the worker leaves out what is the same as in its last message, and the main thread puts the earlier objects back by reference (`snapshot-delta.ts`).
2. **What is compared.** The encoder (`SnapshotEncoder`, in `sim-host`) keeps the JSON of each top-level key (except `t` and `vessels`), of each vessel key (except the per-tick ones: position, velocity, orientation, aero, mach, terrain height, situation, orbit), and per part of everything except its transform and temperature. An unchanged field is listed in `same` (top-level and per vessel) or, for a part, replaced by `same: true` with the transform and temperature that always go over.
3. **The decoder** (`SnapshotDecoder`, in `sim-client`) builds the whole `Snapshot` from the message and the last one: an unchanged field is the same object as in the last snapshot (consumers that compare by identity see less churn); a part keeps its earlier `modules`, `resources` and the rest. A part is looked up by id across vessels, so a part that moved to another vessel (a dock or a split) is found; a vessel, a part or a key that is new or came back is sent whole.
4. **Order and the first message.** Messages come in order from one worker, so the decoder's last snapshot is the encoder's last message; the first message is whole, and a new encoder (a new worker) starts whole.
5. **What stays whole:** overlays, ropes, and any key that changes every tick; a changed field is sent whole (no field-level patches).

## Consequences

- On the M5 in V8 (`scripts/measure-snapshot-transport.ts`, the booster's snapshot grown to N vessels, per message including the decode): 1 vessel 0.097 to 0.023 ms; 5 vessels (115 parts) 0.321 to 0.103 ms; 20 vessels (460 parts) 1.174 to 0.558 ms, and 285 to 125 KB. The worker's encode costs 0.016, 0.052 and 0.188 ms.
- The wire type differs from `Snapshot` (`SnapshotWire`); `sim-host` tests read it as before because the keys are the same.
- A field a consumer mutates in place would now be shared with the next snapshot: snapshots are read-only by convention.
