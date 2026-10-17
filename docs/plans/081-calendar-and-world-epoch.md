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

- ADRs: 0103, [0141](../decisions/0141-calendar-on-the-root-body-epoch-from-j2000-and-a-year-only-with-an-orbit.md) (written here)
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

- [x] `packages/core` test: epoch J2000 (JD 2451545.0 TT) plus 0 s formats as 2000-01-01 11:58:55.816 UTC; a known leap-second boundary (2016-12-31 23:59:60 UTC) formats correctly.
- [x] `packages/core` test: the fictional calendar's day and year lengths equal the stock home body's solar day and orbital period.
- [x] `apps/web` vitest: the warp control shows the formatted date for a given snapshot time.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/081-calendar-and-world-epoch.md` written.
- [x] `docs/architecture/units-and-frames.md` (time), `guides/scripting.md` (`date()`), `docs/research/time-scales.md`.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0103).
- 2026-10-17 — Claimed by Agent 2 (Dev B, M2). Research (`research/time-scales.md`, IERS Bulletin C 72), ADR 0141, core calendar, stock calendar, HUD date, script `date()`, docs. Verification on the M2, rebased on `origin/main` @ 2ff9a9d:
  - `bun test packages/core/test/calendar.test.ts` — 10 pass: J2000 + 0 s = `2000-01-01 11:58:55.816 UTC`; `2016-12-31 23:59:59`, `23:59:60.000`, `23:59:60.500`, `2017-01-01 00:00:00.000` around the leap second; fictional day = solar day and year = orbital period for a home planet around a star.
  - `bun test mods/stock/test/calendar.test.ts` — the stock day is the home planet's rotation (21 600 s, its solar day while it is the root); **no year until plan 122** puts it around a Sun (ADR 0141 point 3). Core may not import the stock mod (boundaries.md), so this half of criterion 2 is a stock test.
  - `bunx vitest run src/lib/hud/WarpControl.test.ts` — 2 passed: the HUD model's date at a snapshot time equals `formatDate`, and `WarpControl` renders it in `hud-date`.
  - `bun test ./packages`, `./mods`, `./examples` — 1278, 84, 7 pass, 0 fail (after adding `date` to the pinned script globals in `sandbox.test.ts`).
  - `bunx vitest run` (apps/web) — 884 passed, 2 failed in `sim-host-script-worker.test.ts`, the same on `origin/main` on this M2 (journal 086).
  - `bun run typecheck` — 0 errors; build — ok; `bun run docs:check` — OK; `playwright test e2e/smoke.e2e.ts --project=chromium` — 6 passed (3.4 m).
  - After rebasing onto the 082 merge: `API_VERSION` 0.1.30 (082 took 0.1.29).
  - **Contract request (to Agent 1, sim tick, ADR 0171 vs ADR 0141):** ADR 0171 point 2 reads `epoch.day` and `epoch.fraction` in tick days (`day(t) = epoch.day + floor(epoch.fraction + t / dayLength)`), while ADR 0141 point 2 defines them as SI days of 86 400 s from J2000.0. They agree for the only epoch in use today ({ day: 0, fraction: 0 }) and differ for any other (plan 087 writes "today"). Proposed, in `packages/sim/src/tick.ts`: `E = (epoch.day + epoch.fraction) × 86 400`, `day(t) = floor((E + t) / dayLength)`, `time(n) = n × dayLength − E` (identical at epoch 0), and `dayLength` from `calendarOf(bodies)` (the fictional calendar's solar day; for `gregorian-utc`, 86 400 s) instead of the root's rotation, which ADR 0171 point 1 anticipates. Today both give 21 600 s for stock, so nothing changes until 087 or 122/124. Not changed here: `packages/sim` is not in 081's Touches.
- 2026-10-17 — Merge by Agent 1 (M5): rebased on `main` @ cff0de5 (SDK index conflict with 095's exports, both kept); `API_VERSION` 0.1.31 (095 took 0.1.30; the journal line above still says 0.1.30). `bun run test` 1389 pass, 0 fail · web vitest 101 files, 891 passed · typecheck exit 0 · build exit 0 · docs:check OK · Chromium smoke 6 passed (2.5m). **Contract request (tick reads the epoch in tick days, ADR 0141 in SI days): deferred** by the Lead. Both agree while the epoch is 0, which is every world until 087 writes a start date. The change to `packages/sim/src/tick.ts` lands as a contract commit (`cp/f1-contract-tick-epoch`) before 087 merges; see `checkpoints.md`.
