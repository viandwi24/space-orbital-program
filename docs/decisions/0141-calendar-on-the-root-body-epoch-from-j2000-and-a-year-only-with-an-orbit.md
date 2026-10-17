# 0141 — The calendar lives on the root body, the epoch counts SI days from J2000, a fictional year needs an orbit

**Status:** accepted
**Date:** 2026-10-17
**Plan:** [081](../plans/081-calendar-and-world-epoch.md)
**Builds on:** ADR 0103 (world epoch and calendar), ADR 0110 (`WorldInfo.epoch`), ADR 0039 (scripts see the sim clock only)

## Context

ADR 0103 point 1 gives a world an epoch (whole days and a fraction on the system's time scale) and each system a calendar (`gregorian-utc` or fictional from the home body's day and year). Plan 081 implements it; four things were open:

1. **Where a "system" declares its calendar.** In the SDK a system of bodies is a plugin's bodies (`WorldInfo.systemId` is a plugin id); there is no planetary-system definition, and an SDK `SystemDefinition` is an ECS system.
2. **What the epoch's day counts from**, for both calendars.
3. **The stock home body is the root** until the Sun arrives (plan 122): it has no orbital period, so a fictional year from it does not exist yet.
4. **How the page and scripts get the date** without the sim reading a clock.

## Decision

1. **The root body carries the calendar.** `BodyDefinition.calendar` (optional, only meaningful on a root body): `{ kind: 'gregorian-utc' }` or `{ kind: 'fictional', home: <body id> }`. A root without it uses `{ kind: 'fictional', home: <the root itself> }`. The time scale follows from the kind: `gregorian-utc` means TT (TDB treated as TT, ADR 0103), `fictional` means plain SI seconds with no leap seconds. The stock home body declares `{ kind: 'fictional', home: 'stock.home' }`; the Sol pack's Sun will declare `gregorian-utc`.
2. **The epoch counts SI days of 86 400 s from J2000.0** (2000-01-01 12:00:00 TT, JD 2451545.0) on the system's scale: `{ day: 0, fraction: 0 }` is J2000 for a Gregorian system, and for a fictional system it is the start of year 1, day 1, 00:00:00. A fictional calendar has no relation to J2000; it only uses the same unit. All conversions carry (whole days, seconds) and normalise; `t` is never added to a Julian date in one float.
3. **Fictional day and year come from the home body.** Day = the home body's **solar** day: its rotation period when it orbits nothing, else `1 / (1/rotation − 1/orbitalPeriod)` (prograde). Year = its orbital period around its parent; **a home body without an orbit has no year**, and the date reads `Day N, hh:mm:ss`. So the stock calendar shows days only until plan 122 puts the home planet around a Sun; then the same data gives years with no change here. Hours, minutes and seconds are SI (a stock day is 6 h).
4. **Gregorian UTC at the edge.** `gregorian-utc` formats `YYYY-MM-DD hh:mm:ss.sss UTC` through the IERS leap-second table (`docs/research/time-scales.md`), showing `23:59:60` during an inserted second. Dates before 1972 use TAI − UTC = 10 s.
5. **The host computes dates.** The sim's `ready` catalog carries the world's epoch; the page formats the HUD date from it and the bodies, and the script host answers `date(t?)` (default: now) with `{ text, julianDate }` through a provider like `bodies.state`, so the sandbox still has no clock (ADR 0039) and the sim never reads one.

## Alternatives considered

- **A new `defineCalendar` / planetary-system definition in the SDK** — rejected for now: one optional field on the root body covers both calendars, and a system definition belongs to the Sun-as-root work (122) if it is ever needed.
- **Epoch days counted from JD 0** — rejected: day counts near 2.45 million make every fixture unreadable and buy nothing.
- **A made-up year for the stock system before 122** (for example 426 days) — rejected: it would be data that 122 replaces, and a year that does not match any motion in the game is misleading.

## Consequences

- `packages/core` gains `calendar.ts` (`Epoch`, `calendarOf`, `formatDate`, `julianDate`, `epochFromUtc`); `BodyDefinition` gains the optional `calendar` field (SDK and stock follow).
- Plan 081's criterion "the fictional calendar's day and year lengths equal the stock home body's solar day and orbital period" is met for the day; the year part is tested with a home body that orbits a parent, and the stock year appears with plan 122.
- Plan 087 (start date "today") writes the epoch with `epochFromUtc` or `epochFromUnixMs`.
- ADR 0171 (world tick, plan 082) reads the epoch in tick days; the two agree at epoch 0 only. Plan 081 filed a contract request to move the tick to the SI-day reading and the calendar's day length (plan 081 Log).
