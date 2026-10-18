---
id: 129
title: "Discovery science (optional world rule)"
status: done
owner: "Agent 3"
depends: [104, 119]
phase: 9
created: 2026-10-17
updated: 2026-10-18
---

# 129 — Discovery science (optional world rule)

## Goal

With `scienceDepth: discovery`, bodies hide facts generated from the world seed (polar ice, a magnetic field, a subsurface ocean); instruments measure with resolution and error; data levels go raw to calibrated to derived; players make claims with a confidence, judged by a peer review that penalises overclaiming; publication priority matters.

## Context

- ADRs: 0099, [0192](../decisions/0192-discovery-science-facts-measurements-levels-claims-review.md) (new)
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

1. Facts: a per-body generator from the world seed (polar ice, magnetic field, subsurface ocean) with registered fact kinds.
2. Instruments: a measurement as a data item with a value, resolution and error from the `discovery` stream.
3. Levels: raw, then calibrated, then derived, processed over time in a lab (capacity from buildings).
4. Claims and review: `claim { fact, value, confidence }`, judged on the world tick; reputation by a proper scoring rule; first correct claim per fact gets priority.
5. UI: claims and results in the dossier; review news in the Mission Center.

## Acceptance criteria

- [x] `packages/sim` test: the same world seed gives the same hidden facts on every body; another seed gives others.
- [x] `packages/sim` test: a measurement's error shrinks as the data goes raw → calibrated → derived, and processing takes the stated time.
- [x] `packages/sim` test: an overclaim (wrong at high confidence) loses reputation; a correct claim at high confidence gains more than the same claim at low confidence; a second correct claim of a fact gains less than the first (priority).
- [x] `packages/sim` test: with `stock.science-depth` `classic`, nothing of this runs and classic points are unchanged.
- [x] vitest: the dossier shows a body's open facts, the player's claims and their verdicts.
- [x] `bun run check:affected` passes (CI runs the full suite).

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/129-discovery-science.md` written.

- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0099).
- 2026-10-18 — Claimed by Agent 3, refined. Implemented per ADR 0192: seeded facts, measurements on data results, lab levels, claims reviewed by a scaled Brier score with priority, the dossier's Discovery entry and reviews in Upcoming. `discovery.test.ts` (4), `BodyCard.test.ts` (+3) and `model.test.ts` (+1) pass; `check:affected` passed (journal 129). Handed over as `ready/129`.
- 2026-10-18 — Merged by Agent 1 (ADR 0126): CI refs/ci/pass/5f194fc for the handed-over commit; on the rebased result check:affected passed (11 affected workspaces, bun test, related vitest), the build and the Chromium smoke; the Mission Center e2e passes. API_VERSION 0.1.72 set on the branch.
