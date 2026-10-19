# 211 — RCS thrusters and monopropellant

**Plan:** plans/211-rcs-and-monopropellant.md · **Session(s):** Worker A (release roadmap) · **Date:** 2026-10-19

## What was done

- **Sim:**
  - `set-rcs` and `attitude.translate`; the vessel keeps `rcs` and `translate`, and the snapshot shows `rcs`.
  - `VesselApi.rcs` and `translateDemand`, turned into the part frame like `torqueDemand`.
- **Stock `stock.rcs`** (`mods/stock/src/rcs.ts`):
  - per-nozzle allocation `clamp(dir · T + mix(R, lever × dir), 0, 1) × limiter`;
  - `rotate` and `translate` switches and the limiter as part actions;
  - propellant by `thrust / (Isp g0)`, with the Isp interpolated by pressure;
  - `firing` and `dry` in the snapshot;
  - SAS authority from `controlAuthority` while RCS is on.
- **Parts** (`parts/rcs.ts`): the RCS block, the cold-gas port with its own gas, inline and radial monoprop tanks, and an empty 10 u monoprop reserve in the pod.
- **Renderer:** the `rcs-block` generator, and `PartVisual.puffs` jets (`effects/rcs-puff.ts`).
- **Web:**
  - R toggles RCS; H N J L I K translate; Caps Lock gives fine control at 0.25 of the pilot's keys.
  - The RCS pill (`rcs-model.ts`) shows off, on, or "RCS: no propellant".
  - The hiss follows the mean firing.

## Balancing numbers

| Part | Nozzles | Thrust | Isp vac / ASL | Propellant |
|---|---|---|---|---|
| RCS Block | 4 | 1 kN each | 240 / 100 s | monopropellant |
| Cold Gas Thruster | 1 | 200 N | 70 / 40 s | cold gas, 8 u aboard |
| Monopropellant Tank (1.25 m) | — | — | — | 120 u (480 kg) |
| Radial Monopropellant Tank | — | — | — | 30 u (120 kg) |

`rcs-sas.test.ts`: a probe with four blocks and no wheel holds prograde to 0.69° after 20 s under a 1 N·m disturbance. Without RCS it drifts to 154°.

## What surprised me

- A probe left idle goes on rails, where SAS points exactly, so a hold test measures nothing there. The test keeps it awake with the disturbance part.
- Filling the pod's monoprop would add 40 kg to the reference rockets and break every frozen flight, so the reserve starts empty.
- The stock vessel test summed container *capacity* as mass; it now sums the starting amount, as the sim does.
- The `stock.rcs` action group of ADR 0203 makes no sense for a vessel flag. R and the pill send `set-rcs` instead (ADR 0216).

## Decisions made (link ADRs)

- ADR 0216.

## Open questions / follow-ups

- No navball mark of its own: the pill sits beside SAS.
- Plan 227 tunes the hiss level; plan 222 adds the docking mode.

## Verification output

See the plan's Log.
