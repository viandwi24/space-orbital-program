---
id: 093
title: "UI stage 4: the Hangar in the refs layout"
status: in-progress
owner: "Agent 2"
depends: [086, 069]
phase: 5
created: 2026-10-17
updated: 2026-10-18
---

# 093 — UI stage 4: the Hangar in the refs layout

## Goal

The VAB becomes the refs Hangar: a rail of categories with dot indicators and search, part cards with mass and cost (`[—]` until the economy), the blueprint floor, CoM and CoT markers, the tool bar (Place, Move, Rotate, Re-root, Staging), symmetry ×1 to ×6, vessel stats (mass, parts, height, Δv, TWR, cost), staging Δv per stage and pre-flight checks with one verdict (go, caution, no-go) that points at the part at fault.

## Context

- ADRs: 0107
- Read: ADR 0107, 0029, 0041, 0042, 0082, 0083, `refs/space-orbital-program-ui/docs/SCREENS.md` (Hangar), `apps/web/src/routes/vab`, `apps/web/src/lib/vab`, `packages/renderer/src/vab`.
- Plan 069 provides mod-defined categories, which the rail shows.

## Scope

**In:**
- Layout and components; the 3D hall stays (renderer `vab/`), lighting and floor adjusted to the blueprint look.
- Pre-flight checks: existing warnings (no control source, no stages, TWR under 1, stability) as one verdict list with part links; new: over a capacity limit (from 096 when present).
- Cost column and totals read part costs when the economy plan has landed; `[—]` before.

**Out:** multi-assembly workspaces, paint (later VAB plans).

## Touches

- **Size:** M
- **Edits:** `apps/web/src/routes/vab`, `apps/web/src/lib/vab`, `packages/renderer/src/vab`
- **Shared contracts:** none

## Design notes

Keep the editor state model (ADR 0029) and library (ADR 0041) unchanged; this is presentation.

## Steps

1. ADR 0148.
2. Pre-flight verdict: `Check.level`, `verdictOf`, `marginal-twr`, the root part for `no-control`; tests.
3. Category rail and part cards (mass · cost).
4. Top bar (back, Hangar capsule, file actions, Launch) and the right column (Vessel, Staging, Pre-flight).
5. Tool pill (symmetry, CoM and CoT toggles, undo, redo) and the CoT marker.
6. Screenshots and e2e.

## Acceptance criteria

- [x] Existing VAB vitest and e2e tests pass.
- [x] vitest: the pre-flight verdict is no-go for a design without a control source and names the root part; caution for TWR under 1.2 on the first stage.
- [x] vitest: the rail lists the registry's categories in order with a dot on the chosen one; a part card shows `[—]` for a part without a cost.
- [~] Screenshots at 1920x1080 and 1024x768 in `docs/journal/assets/093-*.png` with the self-review against refs Hangar; VAB CPU time per frame within 0.2 ms of before (M5).
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/093-ui-stage-4-hangar.md` written.

- [x] ADR 0148.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0107).
- 2026-10-18 — Claimed by Agent 2 (Dev B, M2).
- 2026-10-18 — Refined: Steps, a rail/card criterion, ADR 0148 (verdict levels beside severity, no fake tool modes, a CoT marker).
- 2026-10-18 — Done on the branch: verdict levels, catalogue rail and cards, top capsules and Launch, Vessel/Staging/Pre-flight column, tool pill, CoT marker; screenshots with self-review. Frame time on the M5 and Firefox are for Agent 1. Journal: [093](../journal/093-ui-stage-4-hangar.md).
