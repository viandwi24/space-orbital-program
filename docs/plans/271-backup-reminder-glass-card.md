---
id: 271
title: "The backup reminder lets the Hangar's tool bar show through: give it the toasts' glass card"
status: done
owner: "backup-reminder session"
depends: [230]
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 271 — The backup reminder lets the Hangar's tool bar show through: give it the toasts' glass card

**Size:** S

## Goal

Fix the owner's report of 2026-10-21. In the Hangar (`/vab`), the backup reminder ("Back up your worlds: one file keeps every world and save safe from the browser." with Export now and Remind me later) sits on the bottom tool bar (SYM ×1 to ×8, Mirror, Snap, Copy, CoM, CoT, Contrast, undo and redo, F frame). The bar's labels show through its text and buttons, and neither can be read. The owner is fine with the reminder sitting over the bar, as long as it reads cleanly.

## Context

- `apps/web/src/routes/(world)/+layout.svelte`: the reminder (plan 230), class `.backup`. It is fixed at `bottom: 3.5rem`, z-index 45, on every page of the world shell.
- `apps/web/src/lib/ui/tokens.css`: `--surface-glass` is `rgb(22 23 26 / 0.6)`. It is meant to be paired with `backdrop-filter: var(--glass-filter)`. With blur off (`data-glass='solid'`) or high contrast (`data-contrast='more'`), both tokens become solid.
- `apps/web/src/lib/ui/Toasts.svelte` and `Panel.svelte`: the same glass, with the filter.

## Scope

**In:** the reminder's card.
**Out:** where the reminder sits. The owner accepts the overlap. The toast region is for short messages that need no answer, and this one has two buttons. The script sign and the save note in the same file have the same missing filter, but they sit at the top and were not reported (follow-up).

## Design notes

- Cause: `.backup` had the glass colour without the glass filter. At 60 % alpha, the bar's white labels came through sharp.
- Fix: add `backdrop-filter: var(--glass-filter)`, as the toasts do. Behind the card, the bar is blurred and darkened (brightness 0.4). Where blur is off, the tokens fall back to `--surface-solid` and no filter, so the card is opaque.

## Steps

1. Reproduce on `/vab` with a due reminder (`orbital.backup-reminder` with `playedMs` past the first hour).
2. Add the glass filter to `.backup`.
3. Check the Hangar with glass, high contrast and blur off, then Space Center and Flight. The worlds screen is outside the world shell and never shows the reminder.

## Acceptance criteria

- [x] On `/vab`, the reminder's text and buttons read cleanly over the tool bar, and no bar label shows through (before and after screenshots, journal).
- [x] With high contrast and with blur off, the card is solid `rgb(20 21 24)` (journal).
- [x] Space Center and Flight show the same clean card (journal).
- [x] `bun run typecheck` and the web vitest run with `CI=true` pass. `bun run lint` passes on this change (journal).

## Docs checklist

- [x] STATUS row, journal.

## Log

- 2026-10-21: Created and done by the backup-reminder session from the owner's report.
