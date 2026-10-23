# 299 — RCS bipropellant thruster and axis toggles

**Plan:** [plans/299-rcs-bipropellant-and-axis-toggles.md](../plans/299-rcs-bipropellant-and-axis-toggles.md) · **Session:** Worker C, 2026-10-24 · **ADRs:** none (ADR 0217 stands)

## What was done

| Where | What |
|---|---|
| `mods/stock/src/rcs.ts` | `propellants` (a mix, by volume) beside `propellant`; the flow uses the engines' `propellantRates`, short of any one resource every nozzle fires less; six axis switches `setAxis:<axis>` (`pitch`, `yaw`, `roll`, `sideways`, `forward`, `vertical`) with Hangar build keys; the SAS authority masks the switched-off axes |
| `core` `VesselApi`, `sim/hooks.ts` | `torqueDemandMasked(mask)` and `translateDemandMasked(mask)`: the vessel's axes are masked first, then turned into the part frame, so a radial block (a turned frame) masks the right axis |
| `mods/stock/src/parts/rcs.ts`, `tech.ts` | `stock.rcs-bipropellant` "OrbitX RV-12 Vernier": four 3 kN nozzles (12 kN), Isp 290 s vacuum and 120 s sea level, liquid fuel and oxidizer at 9 : 11, 90 kg, bronze rcs-block model; unlocked in the RCS node |
| tests | `rcs.test.ts` (+4): the 9 : 11 draw and the mass, roll off gives zero roll torque while pitch works, a translation axis off gives no force, a part without a propellant is refused; `boot` and part-id snapshots |

## Notes

- Existing parts are unchanged: `propellant` still names their one resource and every axis starts on.
- The SAS authority masks the part-frame components, which is exact for blocks with an unturned frame; the thrust itself uses the exact vessel-frame mask.
- The bell is the existing `rcs-block` model in bronze; a bigger bell would be a new visual.
