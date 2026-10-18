---
id: 119
title: "Comms tier 4: transmission queues, store-and-forward, contact windows"
status: in-progress
owner: "Agent 3"
depends: [117, 083]
phase: 7
created: 2026-10-17
updated: 2026-10-18
---

# 119 — Comms tier 4: transmission queues, store-and-forward, contact windows

## Goal

Data items move over the network: per-vessel priority queues (command > telemetry > voice > science > bulk), transmission at the route's rate, store-and-forward at relays when the next hop is down, delivery events, and contact-window prediction so the player knows when data will arrive. Science transmission (103) uses it.

## Context

- ADRs: 0101, 0099, [0189](../decisions/0189-comms-transmission-queues-store-and-forward-contact-windows.md) (this plan)
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

- [x] `packages/sim` test: a 10 Mbit science item over a 1 kbit/s link arrives after 10 000 s of contact time, split across two contact windows, and credits science on arrival.
- [x] `packages/sim` test: a command item preempts queued bulk data.
- [x] Migration test with a frozen fixture.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/119-comms-tier-4-queues-store-and-forward.md` written.
- [x] `architecture/simulation.md` (data flow).
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101, 0099).
- 2026-10-18 — Claimed by Agent 3 (`claim/119`, branch `devc/119-comms-queues`).
- 2026-10-18 — ADR 0189 covers:
  - queued items moved into the radio;
  - sending in kind priority order at the route's shared rate, with `stock.command` first and moving over commands-only links;
  - custody to a relay with an earlier contact;
  - delivery with science credited;
  - next contacts by a 60 s scan;
  - save format 8, with the frozen fixture `save-v7.json`.
- 2026-10-18 — Done here, handed over as `ready/119`:
  - **Sim tests:** `packages/sim/test/comms-queues.test.ts` (6) covers 10 Mbit at 1 kbit/s over two windows with science on arrival, command preemption and cancel, no antenna and comms off, save and resume, store-and-forward, and the 7 → 8 migration.
  - **Full checks:** in the journal.
- 2026-10-18 — Handover (`ready/119`):

```text
Handover: plan 119 — Comms tier 4: transmission queues, store-and-forward, contact windows

Agent: Agent 3 (Dev C, Linux Mint 6c/8 GB)   Branch: devc/119-comms-queues
Base: origin/main @ 4730c93 (rebased 2026-10-18, after 117 and 073)
Commits:
a6242ea test(stock): the boot lists stock.command first among the data kinds (plan 119)
f08c454 docs(plan-119): journal, Log, STATUS, architecture, guide and glossary
2f086e7 feat(core,sim,stock,web): comms tier 4: transmission queues by kind priority at the route's rate, store-and-forward custody to a relay with an earlier contact, delivery with science credited, next contacts and arrival times, the queue in the Comms tab; save format 8; API_VERSION 0.1.68 (plan 119, ADR 0189)
cc797d6 test(plan-119): the frozen format-7 save fixture, written while format 7 is current
8b47f2d docs(plan-119): claim (Agent 3)
Acceptance:
  [x] a 10 Mbit science item over a 1 kbit/s link arrives after 10 000 s of contact, split across two windows, and credits science on arrival — `bun test packages/sim/test/comms-queues.test.ts` — 6 pass (within 20 s of 10 000 s)
  [x] a command item preempts queued bulk data — same file
  [x] migration test with a frozen fixture — same file (save-v7.json, written while format 7 was current)
  [x] bun test, typecheck, build, docs:check — journal (sim suite 1707 pass before the boot-list fix; mods 106 pass after)
Checks run here: bun run test 1707/1710 (742 s; patch benchmark under load; the two stock boot lists, fixed and rerun) · web vitest after the rebase 1012 passed, 1 skipped · typecheck exit 0 · build exit 0 · docs:check OK · e2e not run (no WebGL 2)
Note for the Lead: apps/web public/roadmap.test fails on main itself — plan 073's status "blocked" is not in the public roadmap's known statuses (from the 073 merge; not touched here).
Contracts changed (from Touches): protocol — transmit-data queues with comms on, transmission-cancel, Snapshot.network.queues, comms:data-delivered · save — format 8 (comms.transmissions) with the 7→8 migration · stock data kind stock.command (ADR 0189) · Contract requests: none
Save format / API_VERSION: format 8 (bump with migration and fixture) · API_VERSION patch bump 0.1.68
Docs: journal docs/journal/119-comms-tier-4-queues-store-and-forward.md · ADR 0189 · research none new · simulation.md, writing-a-mod.md, glossary · STATUS row only
Behaviour: with comms on, transmitted science arrives when its bits are sent; a vessel without an antenna can no longer transmit with comms on (two science tests now turn comms off for the direct path).
Resource notes: swap used 1096 MB, thermal ok, sub-workers used 0, anything left running: none
Follow-ups: new drafts none (120 channels, 118 timeline, EC per bit in ADR 0189)
```
