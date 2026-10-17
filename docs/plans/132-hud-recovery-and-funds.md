---
id: 132
title: "HUD: funds read-out and the recovery dialog"
status: draft
owner: ""
depends: [095, 088]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 132 — HUD: funds read-out and the recovery dialog

## Goal

The flight HUD shows the world's funds when the economy is on, and a landed vessel at rest offers **Recover**: a dialog lists the value of its parts and contents, the distance to the nearest recovery site, the factor and the credit (from `VesselSnapshot.recovery`), and confirming sends `recover-vessel` and returns to the Hangar.

## Context

- ADRs: 0113 (points 6 and 8), 0107 (refs visual language), 0140 (tokens)
- Read: plan 095 (sim side, already merged), plan 088 (HUD stage 2), `apps/web/src/lib/hud`.
- Scope pushed out of 095: the sim computes the quote; nothing in the client shows it yet.

## Scope

**In:** funds capsule in the HUD (hidden with the economy off); Recover button on the focused vessel while `recovery` is present; the dialog with the line items from the quote; `recover-vessel` dispatch; a toast with the credit; navigation back to the Hangar.

**Out:** a ledger view (later economy panel, 097); line items per part (the quote has totals).

## Touches

- **Size:** S
- **Edits:** `apps/web/src/lib/hud` (one component file plus its test), `apps/web/src/routes/flight`
- **Shared contracts:** none (reads `Snapshot.economy` and `VesselSnapshot.recovery`, sends `recover-vessel`)

## Steps

1. Funds capsule.
2. Recover button and dialog; dispatch and return.
3. Vitest for the dialog from a snapshot fixture; Chromium e2e: launch, recover on the pad, funds go up.

## Acceptance criteria

- [ ] `apps/web` vitest: with `recovery` in the snapshot the dialog shows value, factor and credit; without it there is no Recover button; with the economy off the funds capsule is hidden.
- [ ] Chromium e2e: in a Career world a vessel recovered on the pad credits 0.98 of its value and the HUD funds change by that amount.
- [ ] `bun run test`, web vitest, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/132-hud-recovery-and-funds.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.

## Log

- 2026-10-17 — Created by Agent 1 as scope pushed out of plan 095 (the HUD side of recovery).
