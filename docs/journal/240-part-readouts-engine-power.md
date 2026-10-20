# 240 — Part read-outs: live engine values, solar and RTG output, resource bars per part

**Plan:** [plans/240-part-readouts-engine-power.md](../plans/240-part-readouts-engine-power.md) · **Session:** Worker C, 2026-10-20 · **ADRs:** none (ADR 0174, 0214 stand)

## What was done

| Where | What |
|---|---|
| `mods/stock/src/modules.ts` | the engine keeps what it does now (`live`: thrust N, Isp s, flow kg/s at the ambient pressure) and, on a flameout, the propellant that ran short (`flameoutCause`); both reach the page in the module snapshot. The status row reads "Flameout: out of oxidizer"; a "Now" row reads `215.0 kN · Isp 300 s · 7.31 kg/s` |
| `mods/stock/src/solar.ts` | a panel keeps its `exposure` (share of its rating, 0 in shadow or folded); the Output row reads `0.50 EC/s · sunlight 100 %`, `Folded: 0 EC/s` or `0 EC/s · in shadow or facing away`; the RTG reads `0.75 EC/s, always` |
| `vessel-panel/ControlRows.svelte` | a bar per store of the part (amount / capacity) above its read-outs, in the Parts row and the inspector |
| tests | `mods/stock/test/modules.test.ts` (+4: live values at vacuum and sea level, the flameout cause, a panel in shadow, folded and RTG) |

## Notes

- A flameout caused by a closed flow lock or an overheat is not told apart: the engine only sees the amount reachable. "Out of" names the first propellant that fell short.
- No air-breathing engine exists, so the reason list has none.
- The e2e of this plan is paused by the owner.
