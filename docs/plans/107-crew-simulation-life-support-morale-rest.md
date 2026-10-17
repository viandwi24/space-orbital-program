---
id: 107
title: "Crew simulation: life support, morale, rest, g-load"
status: draft
owner: ""
depends: [106]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 107 — Crew simulation: life support, morale, rest, g-load

## Goal

Crew consume oxygen, water and food and produce CO2 handled by parts; morale and fatigue change with mission length, crowding, events and rest; g-load and radiation exposure count; each aspect is a world rule with levels (off, simple, full) and presets (Sandbox off, Science simple, Career full); shortages are predicted and shown before they happen.

## Context

- ADRs: 0100
- Read: ADR 0100 points 3 and 4, ADR 0096 (background closed forms).

## Scope

**In:**
- Consumables as resources; scrubber and storage modules in stock.
- Morale and fatigue models (documented formulas) with performance effects.
- g-load tolerance from traits.
- Background consumption on ticks; time-to-empty prediction in the snapshot.
- Rule levels wired to presets.

**Out:** EVA (109).

## Touches

- **Size:** L
- **Edits:** `packages/sim`, `mods/stock`, `packages/sdk`, `apps/web/src/lib/hud`
- **Shared contracts:** **SDK (consumption fields on parts), save (consumables, morale, fatigue)**

## Design notes

Every effect has a visible cause in the crew card.

## Steps

1. Life support.
2. Morale and rest.
3. g-load.
4. Prediction and rules.

## Acceptance criteria

- [ ] `packages/sim` test: a 3-crew pod with N days of supplies reports time-to-empty within 1 % of the closed form and the crew are affected at the stated time, under warp included.
- [ ] `packages/sim` test: with life support `off` nothing is consumed.
- [ ] `packages/sim` resume test mid-shortage.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/107-crew-simulation-life-support-morale-rest.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0100).
- 2026-10-17 — Defaults updated by ADR 0109: control needs a command source (crew aboard or linked probe), `controlWithoutSignal` none in Career/Science and full in Sandbox, Career crew presets standard + hardcore.
