---
id: 110
title: "Part action descriptors and action groups"
status: draft
owner: ""
depends: []
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 110 — Part action descriptors and action groups

## Goal

Modules describe their actions and state (toggle, value, trigger, mode; enabled with a reason; group; icon) through their descriptor; an `action-group` command applies an action to every part of a group in one tick; players can define custom groups saved with the design and bound to keys.

## Context

- ADRs: 0102
- Read: ADR 0102 points 1 and 2, ADR 0033 (descriptors), 0061 (binding table), `packages/core/src/module-info.ts`, `mods/stock/src/modules.ts`, `packages/sim/src/commands.ts` (`action`).

## Scope

**In:**
- Descriptor fields and schema; stock modules describe their actions (engines, reaction wheel, landing legs, lights if any, decouplers, heat shield).
- Group registry (`defineActionGroup`); stock groups.
- `action-group` command; mixed state computed per group.
- Design format: optional `groups` (custom groups); binding table entries for them.
- Snapshot: descriptors of the focused vessel at the HUD cadence; size budget.

**Out:** the vessel panel UI (111).

## Touches

- **Size:** S
- **Edits:** `packages/core`, `packages/sdk`, `packages/sim`, `mods/stock`, `apps/web/src/lib/keybindings.ts`
- **Shared contracts:** **SDK (descriptor fields, `defineActionGroup`), protocol (`action-group`, snapshot descriptors), design format (optional `groups`)**

## Design notes

Size: descriptors for a 100-part vessel stay under 8 kB in the snapshot (measured).

## Steps

1. Schema and stock descriptors.
2. Groups and command.
3. Custom groups in designs and keys.
4. Size measurement.

## Acceptance criteria

- [ ] `packages/sim` test: `action-group` "engines off" sets every engine module off in the same tick; the group state is mixed when one is on.
- [ ] `packages/core` test: a design with custom groups round-trips; an old design without the field loads.
- [ ] Measurement: snapshot descriptors for a 100-part vessel under 8 kB (test asserts the bound).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/110-part-action-descriptors-and-groups.md` written.
- [ ] `plugin-system.md`, `guides/writing-a-mod.md` (actions).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0102).
