# 0172 — Data items: shape, ids, value curve, and where storage lives

**Status:** accepted
**Date:** 2026-10-17
**Plan:** 083
**Builds on:** ADR 0099 point 2 (data and samples), 0101 tier 4 (data items in priority queues), 0014 (module state is world data), 0050 (saves are the world).

## Context

Science (103) produces data and comms tier 4 (119) queues and transmits it. Both need one shape for a data item, a stable id, a notion of how its value changes, and a place on the vessel where items are held. That place must survive saves, resume and staging without special code.

## Decision

1. **Item.** A `DataItem` is plain data: `{ id, kind, bits, value, time, source?: { vessel, part }, subject?, meta? }`. `bits` is a positive finite number (float64 counts bits exactly up to 2^53). `value` is the item's worth when it was made (science points for 103), `time` is the sim time it was made, and `meta` is a flat map of strings, numbers and booleans.
2. **Kind.** `defineDataKind({ id, label, priority, valueCurve? })`, registry kind `data-kind`. `priority` is an integer, lower first (ADR 0101: command, telemetry, voice, science, bulk). `valueCurve` is a list of points `[ageSeconds, factor]` with ascending ages, factors in 0..1, linear between points and flat after the last. Without it the factor is 1. `dataValueAt(kind, item, t)` = `item.value × factor(t − item.time)`, a pure function. Stock kinds: `stock.telemetry` (0), `stock.voice` (1), `stock.science` (2), `stock.image` (3), `stock.bulk` (4).
3. **Storage lives in module state.** A module declares `dataStorage: { capacity(config) }` and keeps `{ items, next }` in its world state. Items therefore save, resume and travel with their part through staging with no new save field. The sim reads and writes them through `packages/sim/src/data.ts`, so a module never touches another module's items.
4. **Ids.** The storing module gives an item the id `<part entity>:<n>` from its own counter `next`. Part entity ids are unique and never reused in a run, so ids are unique in the world, and a moved item keeps its id.
5. **Storing.** `ctx.vessel.data.store(item)` (without `id`) puts the item on the first storage of the vessel, in part order, with room for its bits, and emits `data:stored`. With no room anywhere, the incoming item, which is the newest, is dropped and `data:dropped` (`reason: 'full'`) is emitted. Stored items are never evicted to make room; queues and priorities are 119's.
6. **Commands.** `move-data { vessel, item, to }` moves an item to the storage of part `to` on the same vessel, if that storage has room. `delete-data { vessel, item }` deletes it. An unknown item, a part without storage, or no room is a refusal with a reason.
7. **Snapshot.** `VesselSnapshot.data = { used, capacity, items }` (`items` is the count) for vessels with storage. The storage module's own snapshot lists its items for the UI on request.

## Alternatives considered

- **A vessel-level store** outside module state — rejected: it would need its own save field, its own split rule at staging and its own resume test, all of which module state already gives.
- **Global item ids from the sim PRNG or a sim counter** — rejected: a counter would be a new save field, and the PRNG would shift every other random draw.
- **Evicting low-priority items when full** — rejected here: the choice belongs to the queues of plan 119. Dropping the newest is the simplest rule that never loses data already stored.

## Consequences

- **Mod API:** `defineDataKind`, `ctx.dataKinds`, `ModuleDefinition.dataStorage`, `VesselApi.data`, `DataItem`, `dataValueAt`; additive, `API_VERSION` patch bump.
- **Protocol:** commands `move-data` and `delete-data`, events `data:stored` and `data:dropped`, `VesselSnapshot.data`; additive.
- **Save:** unchanged format. Items are module state in the world.
- **Load report:** `registered['data-kind']`.
