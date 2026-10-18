# 190 — Stock solar panel: electric charge produced on rails through background operations

**Plan:** [plans/190-stock-solar-panel-and-battery-background.md](../plans/190-stock-solar-panel-and-battery-background.md) · **Session:** Agent 1 (Lead), 2026-10-18 · **ADRs:** [0171](../decisions/0171-world-tick-day-length-timing-and-save-fields.md), [0096](../decisions/0096-world-tick-background-operations-and-a-living-world.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `mods/stock/src/solar.ts` | `ModuleSolarPanel` (`stock.solar-panel`): 0.5 EC/s while deployed. One `charge` function serves as both `update` and `background`. A `setDeployed` toggle in the `stock.solar` group |
| `mods/stock/src/parts.ts`, `tech.ts` | `PartSolarPanel` (30 kg, a stack part drawn by the tank generator), unlocked by the Probes node |
| `packages/sim/test/solar.test.ts` | one game day: rails 10 825.4 EC, flight 10 825.5 EC |
| `docs/guides/writing-a-mod.md` | the stock example for `background` |

## What surprised me

- **An idle vessel in a stable orbit leaves flight after 2 s.** The flight half of the test would have gone on rails by itself. A fixture module turns the vessel by 1e-9 N·m to keep it awake.
- **A day of flight at the fixed step takes 11.6 s** on this machine. That is the slowest single sim test added in this batch.
- The agreement test needs a sim, so it sits in `packages/sim/test` and not in `mods/stock`.
