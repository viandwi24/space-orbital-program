---
id: 083
title: "Data items: sized data stored on vessels"
status: draft
owner: ""
depends: [077]
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 083 — Data items: sized data stored on vessels

## Goal

Data is a first-class thing: a data item has a kind, a size in bits, a value curve and metadata (source, subject, time); vessels store items in storage modules with capacity; items can be moved, deleted and (later) transmitted and recovered. Science (103) and comms tier 4 (119) build on this.

## Context

- ADRs: 0099, 0101
- Read: ADR 0099 point 2, ADR 0101 tier 4, `refs/reverse-engineering-ksp2/beyond/01-communications-network-and-radio.md` (data), `packages/sim/src/resources.ts`.

## Scope

**In:**
- `defineDataKind({ id, priority, valueCurve })` in the SDK; stock kinds: science, telemetry, image, voice, bulk.
- A storage module config (capacity in bits) and per-vessel storage state (list of items, used bits).
- Commands: move item between storages of one vessel, delete item; events `data:stored`, `data:dropped` (full).
- Snapshot: storage use of the focused vessel; items on request.

**Out:** transmission and queues (119), science generation (103).

## Touches

- **Size:** M
- **Edits:** `packages/core`, `packages/sdk`, `packages/sim`, `mods/stock`
- **Shared contracts:** **core types, SDK (`defineDataKind`, storage module), protocol (commands, events), save (stored items)**

## Design notes

Items are plain data in the world; sizes in bits as numbers (float64 exact up to 2^53).

## Steps

1. Types, schemas, registry.
2. Storage module and state; commands; snapshot.
3. Resume test; staging splits storage with its part.

## Acceptance criteria

- [ ] `packages/sim` test: storing items beyond capacity drops the newest with `data:dropped`; moving an item between two storages keeps total bits.
- [ ] `packages/sim` test: after staging, the items stay with the part that held them.
- [ ] `packages/sim` resume test with stored items is byte-exact.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/083-data-items-on-vessels.md` written.
- [ ] `docs/architecture/simulation.md`, `plugin-system.md`, `guides/writing-a-mod.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0099, 0101).
