---
id: 365
title: "Snapshot transport: fewer bytes and less parsing per frame on the main thread"
status: draft
owner: ""
depends: [363]
phase: 8
created: 2026-10-22
updated: 2026-10-24
---

# 365 — Snapshot transport: fewer bytes and less parsing per frame on the main thread

## Goal

A ranked item from plan 363's research (`docs/research/frame-budget-and-efficiency.md` §5). The owner asked for efficient rendering and a playable frame rate on 2026-10-22.

When this is done, the per-part transforms reach the main thread without a structured clone, and `worker.onmessage` costs half as much at 20 vessels.

## Context

- The sim worker posts a full `Snapshot` with a structured clone every tick (`apps/web/src/lib/sim-host.ts`, `TICK_MS = 16` ~35). The message is `{ kind: 'snapshot'; snapshot; warp; stepMs }` (`apps/web/src/lib/messages.ts` ~190), parsed in `sim-client.ts` `worker.onmessage` (~109).
- Plan 363's numbers (Kronos V + Selene, 30 parts, `profile-frame.ts`): 0.15 ms and 48 KB per frame in orbit, 0.28 ms and 108 KB on the pad. They predate the snapshot's growth:
  - mod overlays (`Snapshot.overlays`, `packages/core/src/protocol.ts` ~478, ebba28a4, ADR 0296);
  - winch ropes on vessels (8d658ac9, plan 313, ADR 0272).

## Scope

**In:** the per-part transforms and other per-tick numbers; the transport between worker and main thread.
**Out:** overlays, ropes and other slow or irregular fields stay on the cloned path.

## Steps

1. New baseline: the snapshot's size and clone cost against the part count (1, 5 and 20 vessels), with `profile-frame.ts`.
2. Choose among:
   - a binary layout for the per-part transforms (positions, rotations, temperatures) in a transferable `ArrayBuffer`, the rest cloned as now;
   - a snapshot at the draw rate only, without dropping sim ticks;
   - deltas for the slow fields.
3. ADR for the chosen layout. Consumers keep the `Snapshot` type.
4. Implement and measure after.

## Acceptance criteria

- [ ] `profile-frame.ts`: `worker.onmessage` time and allocation per frame halve at 20 vessels, before and after in the journal.
- [ ] `bun test packages/sim` and `cd apps/web && bunx vitest run` pass.
- [ ] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row; journal; ADR for the layout.

## Log

- 2026-10-22 — Drafted by plan 363.
- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: still valid; snapshots are still structured-cloned; the snapshot grew (overlays, winch ropes), so the first step is a new baseline; overlays and ropes stay on the cloned path.
