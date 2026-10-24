# 280 — Deployables break in strong airflow; the Hangar names the part that replaces a hidden one

**Plan:** [plans/280-power-comms-science-life-support.md](../plans/280-power-comms-science-life-support.md) · **Session:** Worker B, 2026-10-24 · **ADR:** 0351 (0259, 0257, 0148) · **API:** 0.1.127

## What was done

| Where | What |
|---|---|
| `mods/stock/src/solar.ts`, `comms.ts` | `breakQ`, `broken` in state and snapshot, `dynamicPressure`; a broken panel folds and gives nothing, a broken antenna is off; no action or staging step undoes it; readouts and action reasons say so |
| `mods/stock/src/parts/*` | break pressures: folding array 40 kPa, wings 30, big tracking arrays 25, folding dish 20, whip 60 kPa (a fixed panel and the legacy parts have none); `catalog.replacedBy` on the hidden stack panels, RTG, antennas, instruments, life support and data drive |
| `core/schemas.ts` | `catalog.replacedBy`; API 0.1.127 |
| `web/editor/checks.ts` | `legacy-part`: names each hidden part with its successor, highlights them, never blocks Launch |
| tests | `mods/stock/test/part-support.test.ts` (breaks above, survives below and folded, cannot be redeployed, the stock values), `sim/test/airflow-break.test.ts` (a deployed array at 5 km and 700 m/s breaks, folded survives; a design with the old stack panel loads and flies), `web/editor/checks.test.ts` (the notice for a design with old parts, none without, every `replacedBy` names a visible part) |

## Break pressures

KSP-like, for the vacuum: a capsule at terminal speed has about 44 kPa at sea level, so a deployed folding array on one breaks, as it should.

## Open

A toast in flight; deployed science (plan 284); a one-click swap.
