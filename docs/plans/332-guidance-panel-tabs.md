---
id: 332
title: "Guidance Computer panel with a tab per program; panel nodes tabs, progress, number, notice"
status: in-progress
owner: "rendezvous session (Claude)"
depends: [321, 331]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 332 — Guidance Computer panel with tabs

## Goal

The Guidance Computer's panel looks tidy and follows the v3 design: a tab per program (Ascent, Orbit, Rendezvous, Landing, Log), each with its own inputs, live read-outs and a clear Engage and Abort. The engaged program is obvious (its tab marked and opened, phase, progress, status line); a program that cannot start says why.

## Context

- Owner (2026-10-22, relayed): "tolong guidance uinya di perbaiki juga yah biar kelihatan bagus, rapih dengan banyak menu juga enak bisa pakai sistem tabs atau apa".
- Design reference: the v3 UI package (`refs/space-orbital-program-ui-v3-2`, untracked): Segmented/tabs, stat cells, primary and secondary buttons, dock panel 280 px.
- ADRs 0149, 0285, new **0287**.

## Scope

**In:** panel nodes `tabs`, `progress`, `number`, `notice`, button `tone`, section `columns` (core schema, web evaluation and drawing, tests); the Guidance panel rebuilt with them; ascent and landing parameters as settings.
**Out:** a custom-frame UI; new autopilot behaviour.

## Steps

1. ADR 0287 and this plan.
2. Core types and schema; web `evaluate.ts` and `PanelView.svelte`; vitest for the new nodes.
3. The Guidance panel with tabs; mod tests.
4. Screenshot in the dev build, docs, STATUS, journal.

## Acceptance criteria

- [ ] `bun test packages/core mods/guidance`: the new nodes validate; the Guidance panel has the five tabs, opens the engaged program's tab, and its buttons give engage and disengage commands with the settings.
- [ ] web vitest (`CI=true`): `evaluate.ts` evaluates tabs, progress, number and notice and routes a number field's and a tab child's command.
- [ ] A screenshot of the panel in the dev build.
- [ ] `bun run typecheck`, `bun run test`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row.
- [ ] `docs/journal/332-guidance-panel-tabs.md`.
- [ ] Guide: the new panel nodes; the Guidance Computer section.

## Log

- 2026-10-22 — Drafted and started by the rendezvous session on the owner's request.
