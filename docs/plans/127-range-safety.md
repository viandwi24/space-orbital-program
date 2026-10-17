---
id: 127
title: "Range safety: safe azimuth fans and stage impact zones"
status: draft
owner: ""
depends: [092, 095, 078]
phase: 9
created: 2026-10-17
updated: 2026-10-17
---

# 127 — Range safety: safe azimuth fans and stage impact zones

## Goal

Each site has a safe launch fan computed from its geography; before launch, the predicted impact points of spent stages are checked against land and other sites; the `rangeSafety` rule decides: `cost` (default: allowed with a funds and reputation penalty shown before launch), `hard` (refused with the reason) or `off`.

## Context

- ADRs: 0097
- Read: ADR 0097 point 8, ADR 0021 (debris rails), plan 092 (site consequences).

## Scope

**In:**
- Fan computation from the terrain's land/sea map around the site.
- Impact prediction for each stage separation from a nominal ascent (or the flight's actual staging in flight).
- Penalty ledger entries; a pre-launch panel on the Launch screen; an in-flight warning when an actual impact will violate.
- Rule wiring.

**Out:** crowd evacuation and fines by other agencies.

## Touches

- **Size:** M
- **Edits:** `packages/core`, `packages/sim`, `mods/stock`, `apps/web/src/routes/launch`, `apps/web/src/lib/hud`
- **Shared contracts:** **protocol (range-safety status in snapshot)**

## Design notes

Prediction uses the same debris ballistic model as the sim so the warning and the outcome agree.

## Steps

1. Fan computation.
2. Impact prediction.
3. Rule and penalties.
4. UI.

## Acceptance criteria

- [ ] `packages/core` test: a coastal site's fan points over the sea; an inland site has a narrower fan.
- [ ] `packages/sim` test: with `hard`, a launch whose first stage is predicted onto another site is refused with the reason; with `cost`, it proceeds and books the penalty once.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/127-range-safety.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097).
