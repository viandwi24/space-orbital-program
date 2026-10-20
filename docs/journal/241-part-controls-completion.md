# 241 — Part controls

**Plan:** [plans/241-part-controls-completion.md](../plans/241-part-controls-completion.md) · **Session:** Worker C, 2026-10-20 · **ADRs:** none (ADR 0174 point 3 budget raised, below)

## What was done

| Part | Control |
|---|---|
| reaction wheel | mode: normal, SAS only, pilot only. `VesselControl.assisted` says the attitude demand is the assist's; a wheel serves only its side, in torque and in the authority the assist may count on (`wheelServes`) |
| decoupler | "Fires with staging": off, only its own Decouple fires it |
| wheel | steering on/off and invert (a fixed wheel has neither) |
| RCS | build settings (limiter, rotation, translation start values) and a `stock.rcs` action group on the rotation switch |
| battery | the electric charge flow lock belongs to the `stock.batteries` group |
| parachute | spread, 0–30°: the canopy drag acts that far off the axis on 1.5 m lines |
| control surface | Deploy: a steady deflection added to the control demand |

Tests: `mods/stock/test/modules.test.ts` (+5); `part-actions.test.ts` (counts and the snapshot size).

## Decision

- **The action snapshot budget went from 8 kB to 12 kB** for the 100-part test vessel (a third wheels, a third decouplers): a mode per wheel and a switch per decoupler add 66 states, 3.6 kB. ADR 0174 point 3's 8 kB assumed fewer descriptors; the snapshot is still compact tuples.

## Left for plan 254

Crew transfer in the pod inspector, Set as target on a docking port, Take (EVA), a wheel motor (wheels have no drive), a pod SAS level and the RCS navball mark: each needs new sim or UI support. Plan 254 holds them.
