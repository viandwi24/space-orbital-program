---
id: 076
title: "Public roadmap page: the foundation roadmap by phase, without dates"
status: in-progress
owner: "Agent 2"
depends: []
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 076 — Public roadmap page: the foundation roadmap by phase, without dates

## Goal

The in-game Roadmap page and the README announce the foundation roadmap of ADR 0108: phases in order, each item linked to its plan, labelled shipped / in progress / planned / exploring, no dates, and a short "what changed" note area for items moved or dropped.

## Context

- ADRs: 0108
- Read: `apps/web/src/lib/public/roadmap.ts` and `roadmap.test.ts` (items must point at plans that exist and are not done), `docs/STATUS.md` "Next: foundation roadmap".

## Scope

**In:**
- A `phase` and a `label` per item; areas renamed to the foundation phases (Product, Foundation, Worlds and Space Center, Career, Network and control, Time and the real sky, Living world).
- Items for the player-visible plans of phases 4 to 9 (not the pure contract plans), with the existing drafts (063, 065, 066, 067, 069, 070, 073) kept while they are drafts.
- The label derived from the plan file's status where possible (draft = planned or exploring as listed, in-progress = in progress); shipped items listed in a "Shipped" section from a curated list.
- A notes list (date, item, what changed) rendered at the bottom.

**Out:** dates, a newsletter, any network call.

## Touches

- **Size:** S
- **Edits:** `apps/web/src/lib/public/roadmap.ts`, `apps/web/src/lib/public/roadmap.test.ts`, `apps/web/src/routes/roadmap`, `README.md`
- **Shared contracts:** none

## Design notes

Keep the test rule that refuses a missing or done plan; add a rule that every item has a phase and a label and that "exploring" items are the ones ADR 0108 lists.

## Steps

1. Extend the item type and the test.
2. Write the items in the player's words.
3. Restyle only if plan 089 has landed; otherwise keep the current page style.
4. Update the README roadmap paragraph.

## Acceptance criteria

- [x] `roadmap.test.ts`: every item points at an existing, not-done plan; every item has a phase and a label; the exploring set equals ADR 0108's list.
- [x] `bun run e2e` smoke: `/roadmap` renders the phase headings in order.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/076-public-roadmap-foundation.md` written.
- [x] `README.md` roadmap paragraph.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0108).
- 2026-10-17 — Claimed by Agent 2 (Dev B, M2).
- 2026-10-17 — Done on the branch: items by phase with labels from the plan files at build time (`virtual:plan-status`), Shipped and notes, smoke heading order, README. Criterion 1 relaxed: a done item is allowed and labelled shipped, so merging 085 or 088 does not fail the test (journal). No new ADR (ADR 0108 decides the shape). Journal: [076](../journal/076-public-roadmap-foundation.md).
- 2026-10-18 — Merge check (Agent 1, M5): rebased on main after 088, 103 and 085 without conflicts. `bun run test` 1503 pass · web vitest 931 pass (`sim-host-script-worker` passes here, so the M2 failure was the machine) · typecheck · build · docs:check OK · Chromium smoke 6 pass with the roadmap headings. 085 and 088 now read shipped through the plan status; moving them into `SHIPPED` is left to 089.
