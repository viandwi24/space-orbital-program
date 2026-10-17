---
id: 081
title: "Calendar and world epoch: dates in the game"
status: in-progress
owner: "Agent 2"
depends: [077]
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 081 — Calendar and world epoch: dates in the game

## Goal

A world has an epoch (two-part, on its time scale) and a calendar (fictional from the home body, or Gregorian UTC); the HUD time control and saves show a date and time; scripts get `date()`; the sim still never reads a clock.

## Context

- ADRs: 0103
- Read: ADR 0103 points 1 and 2, `docs/architecture/units-and-frames.md`, `apps/web/src/lib/hud/WarpControl.svelte`, `packages/scripting` API docs.
- Time scales: TDB treated as TT; UTC via a leap-second table at the UI edge (look up and record the table source and date in `docs/research/time-scales.md`).

## Scope

**In:**
- Core: `Epoch` (day count + fraction), conversions (epoch + t to Julian date, to calendar fields), `fictional` calendar from the home body's solar day and orbital period, `gregorian-utc` calendar.
- System-level `timeScale` and `calendar` on body packages (stock: fictional).
- HUD: game date next to MET/UT.
- Script API: `date()` returns the calendar string and the Julian date, from the host.

**Out:** start-date choice (087), catch-up (087), Sun as root (122).

## Touches

- **Size:** S
- **Edits:** `packages/core`, `packages/sdk`, `mods/stock`, `apps/web/src/lib/hud`, `apps/web/src/lib/script-api.ts`, `packages/scripting`
- **Shared contracts:** **core types (`Epoch`, calendar), save (epoch already in format 5), script API (`date()`)**

## Design notes

Precision: never add `t` to a Julian date in one float; keep (days, seconds) and normalise.

## Steps

1. Research time scales and leap seconds; record.
2. Core types and conversions with tests.
3. Stock calendar data; HUD date.
4. Script `date()` and guide.

## Acceptance criteria

- [ ] `packages/core` test: epoch J2000 (JD 2451545.0 TT) plus 0 s formats as 2000-01-01 11:58:55.816 UTC; a known leap-second boundary (2016-12-31 23:59:60 UTC) formats correctly.
- [ ] `packages/core` test: the fictional calendar's day and year lengths equal the stock home body's solar day and orbital period.
- [ ] `apps/web` vitest: the warp control shows the formatted date for a given snapshot time.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/081-calendar-and-world-epoch.md` written.
- [ ] `docs/architecture/units-and-frames.md` (time), `guides/scripting.md` (`date()`), `docs/research/time-scales.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0103).
