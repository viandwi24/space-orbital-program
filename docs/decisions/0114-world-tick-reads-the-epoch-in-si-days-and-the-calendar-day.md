# 0114 — The world tick reads the epoch in SI days and takes its day from the calendar

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (contract change by the Lead, requested in plan 081's Log; checkpoint `cp/f1-contract-tick-epoch`)
**Amends:** ADR 0171 points 1 and 2 · **Builds on:** ADR 0141 point 2 (the epoch is SI days from J2000.0)

## Context

ADR 0171 read `WorldInfo.epoch.day` and `fraction` as tick days, while ADR 0141 defines the epoch as SI days of 86 400 s from J2000.0. Both agree only at epoch 0, which every world had until plan 087 writes a start date. The tick also took its day from the root body's rotation, where ADR 0141 gives the calendar's day.

## Decision

1. **Day length** of the tick is the calendar's day, `calendarOf(bodies)` of the system the sim runs (its root first): a fictional calendar's solar day of the home body, 86 400 s for `gregorian-utc`. Stock is unchanged at 21 600 s.
2. **Day number:** with `E = (epoch.day + epoch.fraction) × 86 400` s, `day(t) = floor((E + t) / dayLength)` and the tick of day `n` fires at `time(n) = n × dayLength − E`. Day numbers count tick days since J2000.0. At epoch 0 both formulas equal ADR 0171's.
3. Saved `worldTick.lastDay` values stay valid: every existing save has epoch 0.

## Consequences

- Plan 087 writes "today" as an SI-day epoch (`epochFromUnixMs`) and the tick follows it; charges on "every 30th day" (ADR 0113) count from J2000.0, so a new world's first charge falls on the next multiple, not 30 days after creation. 095's career bot (epoch 0) is unchanged.
- `TickState.length` holds the day; `dayLength(core)` reads it.
