---
id: 365
title: "Snapshot transport: fewer bytes and less parsing per frame on the main thread"
status: draft
owner: ""
depends: [363]
phase: 8
created: 2026-10-22
updated: 2026-10-22
---

# 365 — Snapshot transport: fewer bytes and less parsing per frame on the main thread

## Goal

A ranked item from plan 363's research (`docs/research/frame-budget-and-efficiency.md` §5). The owner asked for efficient rendering and a playable frame rate on 2026-10-22.

## Context

The sim worker posts a full snapshot with a structured clone about 60 times a second (`sim-host.ts`, `TICK_MS = 16`).

In the owner's scene (Kronos V + Selene, 30 parts), `profile-frame.ts` put `worker.onmessage` at:
- 0.15 ms and 48 KB of allocation per frame in orbit;
- 0.28 ms and 108 KB per frame on the pad.

With more vessels in a save, this grows with the part count.

## Steps

- Measure the snapshot's size and its clone cost against the part count (1, 5 and 20 vessels).
- Options:
  - a binary layout for the per-part transforms in a transferable `ArrayBuffer` (positions, rotations, temperatures), with the rest as now;
  - a snapshot at the draw rate only, without dropping sim ticks;
  - deltas for the slow fields.
- Write an ADR for the chosen layout and keep the `Snapshot` type for consumers.

## Acceptance criteria

- [ ] `profile-frame.ts`: `worker.onmessage` time and allocation per frame halve at 20 vessels, with before and after in the journal.
- [ ] `bun test packages/sim` and the web vitest pass.
- [ ] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row; journal; ADR for any design choice.

## Log

- 2026-10-22 — Drafted by plan 363.
