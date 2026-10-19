# 209 — Parachutes

**Plan:** [plans/209-parachutes.md](../plans/209-parachutes.md) · **Session:** Worker B, 2026-10-19 · **ADRs:** [0203](../decisions/0203-ksp-grade-parts-pack.md) point 4 · **Research:** `refs/reverse-engineering-ksp-ksp2/07`, `16` (main 0.04 atm / 1000 m, drogue 0.02 atm / 2500 m)

## What was done

| Where | What |
|---|---|
| `mods/stock/src/parachute.ts` | `stock.parachute`: stowed → armed (staging or Deploy) → semi at the min pressure → full below the full-deploy height; cut and torn; safety from speed and dynamic pressure; drag `½ρ CdA |v| v` at the chute's top; Deploy, Force deploy, Disarm, Cut, the mode and two sliders as descriptors; events `stock:parachute-deployed` and `-torn` |
| `mods/stock/src/parts/recovery.ts` | Parachute (top, 0.625 m), Radial Parachute, Drogue Chute; Basics and Aerodynamics tech nodes |
| core | `Ambient.height` (above the ground), `ModuleInfo.readouts` (state as text), a numeric deploy flag |
| sim | the hook API fills `Ambient.height` from the terrain |
| renderer | `parachute` generator: the pack and a canopy that streams (semi) and opens to a dome (full); its detail follows the preset |
| web | the part panel's readouts ("Parachute: Armed", "Airflow: Unsafe"), toasts, a deploy whoosh, log lines, the parachute icon, the Hangar's two-stage example with a chute (`starterRocket`) |
| tests | stock `parachute.test.ts`, sim `parachute-descent.test.ts`, renderer `parachute.test.ts`, web `parachute-panel.test.ts` and toasts, e2e `parachute.e2e.ts`; `launch.e2e.ts` reads plan 200's pad text |

## What surprised me

- **A falling capsule's dynamic pressure does not depend on its height:** at terminal speed `q = m g / CdA`, about 44 kPa for the stock pod. A first Unsafe limit of 40 kPa meant the chute never opened low down; the e2e found it (the capsule hit the ground at 280 m/s). Mains are now Risky from 50 kPa, Unsafe from 80 kPa.
- **"When safe" cannot wait for Safe:** a capsule's terminal speed at 5 km is about 260 m/s, past the 250 m/s Risky line. It waits while the air is Unsafe.
- **Any force keeps a vessel awake:** a landed capsule under its canopy never went on surface rails, because the drag of a few cm/s was not zero. Below 1 m/s of air the canopy pulls nothing.

## Decisions made (link ADRs)

- No new ADR; ADR 0203 point 4's "waits until speed is safe" is read as "until the air would not tear it" (plan Log). The other choices are in the plan's Log.

## Open questions / follow-ups

- Repacking a chute on EVA (P1); the Hangar's chute tweaks come with plan 218.
- Plan 231 places the radial chute and the drogue in the tech tree for good.

## Verification output

```
(filled in at handover)
```
