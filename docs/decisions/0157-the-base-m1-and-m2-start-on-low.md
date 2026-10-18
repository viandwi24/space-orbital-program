# 0157 — The base M1 and M2 start on `low`; the renderer misses ADR 0025's budget on its budget machine

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [066](../plans/066-environment-devices-and-mobile.md)
**Builds on:** ADR 0025 (M1/M2 are the budget machine), ADR 0053 (budgets `high` 16.7 ms, `medium` 13.3 ms, and the governor), ADR 0061 (the half-resolution planet pass)

## Context

`selectPreset` gave an Apple M1 or M2 `medium` on a guess: every frame table until now was measured on an M5. Plan 066 measured an M2 (MacBook Pro 13", 2022) with journal 054's method in the visible browser pane at 1920 x 1080: `medium` reads 33 ms at the pad, 33 to 34 ms at 3 and 12 km and 21 ms in orbit; `high` 40 to 45 ms; `low` 21 to 24 ms below 12 km and 13 ms in orbit; the Space Center 35.6 ms on `medium` and 23.6 on `low`. The half-resolution rung brings `medium` at the pad to 16.3 ms. Numbers in journal 066.

## Decision

1. **`selectPreset` returns `low` for the base Apple M1 and M2 GPUs.** It is the preset nearest the budget on that machine (21.6 ms at the pad against `medium`'s 33); the governor's resolution and half-planet rungs (ADR 0053) work down from there.
2. **Their Pro, Max and Ultra GPUs keep `medium`** until measured: they have two to four times the base GPU's cores. M3 and later keep `high` (unmeasured; the M5 holds `high`).
3. **The ladder order and the precompile order are unchanged.** Nothing measured here argues for another order; the governor's rungs on the M2 were not run in a live loop (the pane's frames stop when the window is out of view).
4. **The budget machine misses the budget.** At 1080p no preset holds 16.7 ms below 12 km on the M2. This is filed as an open issue for a renderer cost pass, not hidden by a threshold.

## Alternatives considered

- **Keep `medium` and rely on the governor** — the governor would need three or four rungs (several seconds each over budget) at every flight start on the most common laptop, and its lowest `medium` rung still reads about 16 ms at the pad.
- **Lower the budgets** — the budgets are the product's bar (ADR 0025); the machine misses them, the bar does not move.

## Consequences

- A new player on a base M1 or M2 starts on `low` (the settings screen can raise it; a saved choice wins).
- The device table has an M2 row; the Intel and phone rows are still empty (no hardware here). `apps/web/scripts/measure-devices.ts` measures a row the same way on any machine.
