# 287 — More blueprints, wave 1

**Plan:** [plans/287-real-rocket-blueprints-waves-2-and-3.md](../plans/287-real-rocket-blueprints-waves-2-and-3.md) · **Session:** Worker C, 2026-10-24 · **ADRs:** 0263, 0268, 0316, 0317 (no new ADR)

## What was done

Two of the plan's blueprints, built from parts stock already has, as stock blueprints by ADR 0316 (builders in `apps/web/src/lib/editor/missions.ts`, baked into `mods/stock/src/blueprints.generated.ts`):

| Blueprint | Tracker | What it is | Flight |
|---|---|---|---|
| Companion-1 | BP-05 | a probe core with four whip antennas and a battery on the stock light launcher | orbit in the stock system and in Sol rescaled (periapsis 50 km, on the ascent autopilot) |
| Semyorka-S + Union | BP-03 | a three-seat capsule under an escape tower with a heat shield and a service module, on two stages and four liquid strap-on boosters | the same |

Their rows are in `EXPECTED` of `blueprint-systems.test.ts` (stock and rescaled reach their goal; Sol 1:1 falls short with this light launcher). `stock-blueprints.test.ts` (bake equality), the English-name test and the Library tests pass with them.

## Not done

The other ten of the plan, which stay draft: Selene Rover (needs the rover carried on the lander and a drive on the moon), Kestrel 9 + Wyvern, Hermes-R (a suborbital hop: no blueprint goal fits it yet), Semyorka-V + Orient-1, Neutron-M + Breeze, Hercules V + Kentauros, Long Road 2F + Divine Vessel, Dioscuri + Giant II, Lumière 5, Kestrel Heavy. Each wants its own tuned ascent and, in the parts the plan names, tapered and toroid tanks (plan 275) and segmented boosters (plan 276), which are drafts. Companion-1 is the simplest of them; its likeness to the Aurora launcher means it adds little beyond the name.
