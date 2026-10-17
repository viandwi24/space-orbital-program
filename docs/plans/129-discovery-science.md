---
id: 129
title: "Discovery science (optional world rule)"
status: draft
owner: ""
depends: [104, 119]
phase: 9
created: 2026-10-17
updated: 2026-10-17
---

# 129 — Discovery science (optional world rule)

## Goal

With `scienceDepth: discovery`, bodies hide facts generated from the world seed (polar ice, a magnetic field, a subsurface ocean); instruments measure with resolution and error; data levels go raw to calibrated to derived; players make claims with a confidence, judged by a peer review that penalises overclaiming; publication priority matters.

## Context

- ADRs: 0099
- Read: ADR 0099 point 5, `refs/reverse-engineering-ksp2/beyond/04-science-beyond-ksp.md` (git-ignored).

## Scope

**In:**
- Hidden fact generator per body; instruments with resolution and noise from the world PRNG stream.
- Data levels and processing (time, lab capacity).
- Claims, review on the world tick, reputation effects.
- UI in the dossier.

**Out:** mini-games for analysis.

## Touches

- **Size:** L
- **Edits:** `packages/sim`, `packages/sdk`, `mods/stock`, `apps/web/src/lib/hud`, `apps/web/src/routes/mission-center`
- **Shared contracts:** **SDK (fact and instrument data), save (facts, claims)**

## Design notes

Classic points stay available beside it (ADR 0099).

## Steps

1. Refine at phase start.

## Acceptance criteria

- [ ] To be made measurable at refinement (same seed gives the same facts; an overclaim loses reputation; a correct claim at high confidence gains more).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/129-discovery-science.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0099).
