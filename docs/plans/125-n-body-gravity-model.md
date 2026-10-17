---
id: 125
title: "N-body gravity model (future; DE440)"
status: draft
owner: ""
depends: [080, 123]
phase: 8
created: 2026-10-17
updated: 2026-10-17
---

# 125 — N-body gravity model (future; DE440)

## Goal

A world can be created with the n-body gravity model: bodies stay on rails (analytic or DE440 Chebyshev ephemerides), vessels are pulled by every body and integrated numerically, predictions become numerical, warp is limited by the integrator, and Create World's "Coming soon" option becomes selectable. Exploring: this plan is refined only when the owner schedules it.

## Context

- ADRs: 0095, 0103
- Read: ADR 0095 point 5, ADR 0103 point 5, `refs/reverse-engineering-ksp2/beyond/05-universe-mode.md` (n-body notes; git-ignored).
- Requires its own ADR at refinement: integrator, step control, warp limits, frame choice, prediction horizon, DE440 data packaging and download size.

## Scope

**In:**
- N-body trajectory provider implementing the interface of plan 080.
- DE440 data per body as a mod asset (download on demand, cached).
- Warp limits and UI explanations; maneuver nodes on numerical paths.
- Validation against reference trajectories.

**Out:** n-body for bodies themselves (Universe mode is not pursued, ADR 0108).

## Touches

- **Size:** XL
- **Edits:** `packages/kepler`, `packages/sim`, `packages/core`, `mods/sol`, `apps/web/src/routes/worlds`
- **Shared contracts:** **core types (provider), save (gravity model values), mod asset format (ephemeris data)**

## Design notes

To be written at refinement.

## Steps

1. Refine into ready with an ADR.

## Acceptance criteria

- [ ] To be made measurable at refinement (energy drift bound over a stated time, agreement with a reference trajectory, warp limit stated and enforced).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/125-n-body-gravity-model.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0095, 0103).
