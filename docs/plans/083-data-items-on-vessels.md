---
id: 083
title: "Data items: sized data stored on vessels"
status: in-progress
owner: "Agent 3"
depends: [077]
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 083 — Data items: sized data stored on vessels

## Goal

Data is a first-class thing: a data item has a kind, a size in bits, a value curve and metadata (source, subject, time); vessels store items in storage modules with capacity; items can be moved, deleted and (later) transmitted and recovered. Science (103) and comms tier 4 (119) build on this.

## Context

- ADRs: 0099 point 2, 0101 tier 4, 0172 (written in step 1: item shape, ids, value curve, storage declaration).
- Read: ADR 0099 point 2, ADR 0101 tier 4, `refs/reverse-engineering-ksp2/beyond/01-communications-network-and-radio.md` (data), `packages/sim/src/resources.ts` and `ResourceStore` in `packages/core/src/definitions.ts` (the pattern the storage declaration follows), the rules registry of plan 078 (`registry.ts`, `plugin.ts`: how a registry and its `ctx` registrar are added), `packages/sim/src/commands.ts`, `packages/sim/src/snapshot.ts`.

## Scope

**In:**
- `defineDataKind({ id, label, priority, valueCurve? })` in the SDK (`ctx.dataKinds`, registry kind `data-kind`): `priority` an integer, lower first (ADR 0101 tier 4 order); `valueCurve` points `[ageSeconds, factor]`, linear between points, flat after the last (default: always 1). Stock kinds: `stock.telemetry`, `stock.voice`, `stock.science`, `stock.image`, `stock.bulk`.
- A data item is plain data: `{ id, kind, bits, value, time, source?: { vessel, part }, subject?, meta? }`; `id` is `<part entity>:<n>` from the storing module's own counter, unique in the world. `dataValueAt(kind, item, t)` is a pure function.
- A module declares storage with `dataStorage: { capacity(config) }`; its state carries `{ items, next }`. Stock: module `stock.data-storage` (config `capacity` in bits) and a new part `stock.data-drive` (existing parts are unchanged).
- Storing: `ctx.vessel.data.store(item)` stores on the first storage of the vessel (part order) with room, emitting `data:stored { vessel, part, item }`; with no room it drops the incoming (newest) item and emits `data:dropped { vessel, item, kind, bits, reason: 'full' }`. `ctx.vessel.data.used()` / `capacity()`.
- Commands: `move-data { vessel, item, to }` (to a part of the same vessel with room; refused otherwise) and `delete-data { vessel, item }`.
- Snapshot: `VesselSnapshot.data` `{ used, capacity, items }` (the count) for a vessel with storage; the storage module's own snapshot lists its items.

**Out:** transmission and queues (119), science generation (103), recovery of data on landing (103), a UI for data (111, 115).

## Touches

- **Size:** M
- **Edits:** `packages/core` (`data.ts` new, `definitions.ts`, `registry.ts`, `plugin.ts`, `protocol.ts`, `protocol-schemas.ts`, `events.ts`, `version.ts`, `index.ts`), `packages/sdk`, `packages/sim` (`data.ts` new, `commands.ts`, `hooks.ts`, `snapshot.ts`, tests), `mods/stock` (data kinds, module, part, tests), `docs/architecture/simulation.md`, `docs/architecture/plugin-system.md`, `docs/guides/writing-a-mod.md`
- **Shared contracts:** **core types (`DataItem`, `DataKindDefinition`), SDK (`defineDataKind`, `ctx.dataKinds`, `dataStorage`, `ctx.vessel.data`; `API_VERSION` patch bump), protocol (`move-data`, `delete-data`, `VesselSnapshot.data`, events `data:stored`, `data:dropped`), load report (`registered['data-kind']`), save (items live in module state in the world: no format change)**

## Design notes

Items are plain data in the world; sizes in bits as numbers (float64 exact up to 2^53).

## Steps

1. ADR 0172; types, schemas, registry, `dataValueAt`; stock kinds.
2. Storage declaration, `ctx.vessel.data`, stock module and part; commands; events; snapshot.
3. Tests: capacity and drop, move and delete, staging, resume byte-exact.

## Acceptance criteria

- [ ] `bun test packages/sim/test/data.test.ts`: storing items beyond capacity drops the newest with `data:dropped` (reason `full`) and keeps the older ones; moving an item between two storages keeps total bits; a move to a storage without room and a move or delete of an unknown item are refused.
- [ ] Same file: after staging, the items stay with the part that held them (on the separated vessel when it held them).
- [ ] Same file: a resume with stored items is byte-exact (`JSON.stringify` of the save and of the snapshot after 10 s, both runs).
- [ ] `bun test packages/core/test/data.test.ts`: `defineDataKind` validates (`priority` integer, curve ages ascending, factors 0..1), `dataValueAt` interpolates and holds after the last point; stock registers the five kinds.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/083-data-items-on-vessels.md` written.
- [ ] `docs/architecture/simulation.md`, `plugin-system.md`, `guides/writing-a-mod.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0099, 0101).
- 2026-10-17 — Refined and claimed by Agent 3. Items live in the storage module's state, so saves, resume and staging come with the world, and the save format does not change. Storage is declared like `ResourceStore`. A new stock part `stock.data-drive` carries the storage, so existing stock parts and the frozen save fixtures are unchanged. Design choices go in ADR 0172.
