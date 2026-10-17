---
id: 111
title: "Vessel panel: Overview with group control, Parts with per-part actions"
status: draft
owner: ""
depends: [110, 088]
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 111 — Vessel panel: Overview with group control, Parts with per-part actions

## Goal

The right vessel panel (refs) has Overview (vessel info, a switch per group with a mixed state) and Parts (parts by category, each with switches, values and icon actions from its descriptors; the selected part highlighted in the 3D view); a Comms tab slot is reserved for plan 115. Mod modules get controls without UI code.

## Context

- ADRs: 0102, 0107
- Read: ADR 0102, 0107, `refs/space-orbital-program-ui/docs/CONCEPT.md` §4 and `SCREENS.md` (Flight vessel panel), plan 110.

## Scope

**In:**
- Panel component and toolbar toggle (088's Vessel button).
- Controls generated from descriptors: switch, slider with unit, segmented mode, trigger button; disabled with the reason as a tooltip.
- Part highlight in the renderer (outline or tint) on hover/selection.
- Touch: 44 px targets.

**Out:** Comms tab content (115).

## Touches

- **Size:** M
- **Edits:** `apps/web/src/lib/hud`, `apps/web/src/routes/flight`, `packages/renderer/src`
- **Shared contracts:** renderer API addition (`Renderer.highlightPart`)

## Design notes

Generated controls must never reorder while the player looks (stable by part index and action id).

## Steps

1. Overview and group switches.
2. Parts list and controls.
3. Highlight.
4. e2e.

## Acceptance criteria

- [ ] vitest: a mod module with a `value` action (fixture) renders a slider and dispatches `action` with the new value.
- [ ] vitest: the engines group switch is mixed when one of two engines is on and turns both off on click.
- [ ] `bun run e2e` (Chromium): toggle the landing legs from the Parts tab in flight.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/111-vessel-panel-group-and-part-control.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0102, 0107).
