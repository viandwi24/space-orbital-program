# 212 — Mach effects, atmosphere temperature curves, heating rule, part temperature limits

**Plan:** [plans/212-flight-model-additions.md](../plans/212-flight-model-additions.md) · **Session:** Worker B, 2026-10-19 · **ADRs:** [0204](../decisions/0204-flight-model-additions.md), 0023 · **Research:** US Standard Atmosphere 1976 layer table (`research/stack-versions.md`)

## What was done

| Where | What |
|---|---|
| core | body `atmosphere.temperatureCurve`, `gamma`, `gasConstant`; `STANDARD_ATMOSPHERE_TEMPERATURE` (also in the SDK); `Ambient.temperature` and `speedOfSound`; `PartSnapshot.maxTemperature`, `VesselSnapshot.mach` and `hottest` |
| sim | `atmosphere.ts`: `temperatureAt`, density `p/(R·T)`, speed of sound, `machDragFactor`; the drag pass multiplies by it; the convective heat input is scaled by `stock.reentry-heating`; default part limit 2000 K |
| stock | the rule (0–1.2, launch group); the home body's curve; parts drop their own limits for the default, pod 2400 K, shield 3300 K |
| Sol | Earth uses the standard atmosphere; the rescaled variant shrinks the curve with its air |
| web | a temperature bar with "N K of M K" in the vessel panel from 400 K or half the limit; the script API lists the curve |
| tests | sim `atmosphere-temperature`, `mach-drag`, heating (rule 0 and 1.2, a pod under 2400 K, an 800 K test part for the overheat path); e2e `reentry.e2e.ts` |

## What surprised me

- **Under KSP-like limits a low-orbit entry burns nothing.** The unshielded probe peaks at 864 K; even a hyperbolic pass at 6 km/s stays near 1300 K. That matches KSP (a pod comes back from low orbit without a shield), so the overheat path is now tested with a part rated 800 K.
- **The ascents barely moved:** the booster rocket's circularisation Δv went from 1780 to 1835 m/s (3 %), the asparagus and Sol ascents still reach their orbits. The colder, denser air aloft and the transonic peak cancel out partly; no stock design needed a change.
- **Knock-on in fragile tests:** the moon landing's sideways drift at a new landing site tipped the lander (its test's lean gain went from 0.1 to 0.3), the Sol transfer planner's search needed a finer grid, a glider and an aeroplane trim about half a degree differently, and plan 209's parachute e2e needed a faster fall to show Armed (the transonic drag brakes from 400 m/s in about a second).
- **The sun-parity fixture was re-frozen.** It was frozen once on pre-Sun code and said never to regenerate; its flight crosses the air, so it could not match after an intended physics change. It now pins the flight against unintended change (noted in its header).

## Decisions made (link ADRs)

- ADR 0204 as written: heating rule 0–1.2 (the plan said 0–1.5), Mach curve flat at 1.6 from Mach 2. The rest in the plan's Log.

## Open questions / follow-ups

- The renderer's plume and re-entry effects and the web's aero readout still use their own isothermal density (visual only).
- The heating model may want a stronger convective term if the owner wants unshielded low-orbit entries to be dangerous again.

## Verification output

```
(filled in at handover)
```
