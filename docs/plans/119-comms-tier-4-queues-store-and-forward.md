---
id: 119
title: "Comms tier 4: transmission queues, store-and-forward, contact windows"
status: draft
owner: ""
depends: [117, 083]
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 119 — Comms tier 4: transmission queues, store-and-forward, contact windows

## Goal

Data items move over the network: per-vessel priority queues (command > telemetry > voice > science > bulk), transmission at the route's rate, store-and-forward at relays when the next hop is down, delivery events, and contact-window prediction so the player knows when data will arrive. Science transmission (103) uses it.

## Context

- ADRs: 0101, 0099
- Read: ADR 0101 tier 4, ADR 0099 point 2, plan 083.

## Scope

**In:**
- Queue component per node; transmission per tick of the network cadence; partial items.
- Store-and-forward custody at relays with storage limits.
- `comms:data-delivered`; science credited on delivery.
- Contact windows in the snapshot (next window per queued item).
- Background transmission for unloaded vessels (closed form over windows).
- Save format bump (queues, stored bundles).

**Out:** channels and licences (120).

## Touches

- **Size:** M
- **Edits:** `mods/stock`, `packages/sim`, `packages/core`, `apps/web/src/lib/hud`
- **Shared contracts:** **protocol (queue commands), save (format bump: queues, bundles)**

## Design notes

Use the world tick for background transmission between loaded steps.

## Steps

1. Queues and priority.
2. Store-and-forward.
3. Delivery and science.
4. Windows and background.
5. Save bump.

## Acceptance criteria

- [ ] `packages/sim` test: a 10 Mbit science item over a 1 kbit/s link arrives after 10 000 s of contact time, split across two contact windows, and credits science on arrival.
- [ ] `packages/sim` test: a command item preempts queued bulk data.
- [ ] Migration test with a frozen fixture.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/119-comms-tier-4-queues-store-and-forward.md` written.
- [ ] `architecture/simulation.md` (data flow).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101, 0099).
