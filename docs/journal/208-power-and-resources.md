# 208 — Resources and power: monoprop, solid fuel, batteries, real solar, RTG, transmit cost

**Plan:** plans/208-power-and-resources.md · **Session(s):** Worker A (release roadmap) · **Date:** 2026-10-19

## What was done

- **Resources:** `stock.monopropellant` (4 kg/u, vessel flow) and `stock.solid-fuel` (7.5 kg/u, no flow, for plan 210's SRBs). `stock.eva-propellant` became `stock.cold-gas` (`ColdGas`; `EvaPropellant` stays as an alias). Save migration 8 → 9 renames the id everywhere in a save with the generic `renameId`.
- **Batteries:** three sizes at 5 kg per 100 EC: 100 EC (0.625 m), 400 EC and 1 000 EC (1.25 m).
- **Sunlight:** `VesselApi.sunExposure(dt, factor)` in `packages/sim/src/sunlight.ts` (ADR 0214):
  - the direction of the star in the part frame;
  - inverse-square flux relative to the home planet's orbit;
  - a shadow cylinder per body;
  - one sample in flight, and samples every 10 s along the rails path on rails.
- **Panels:** `flat` or `track` mode, and `deployable: false` for a fixed panel. Stock has the folding 0.5 EC/s panel, a fixed 0.35 EC/s panel and a large 8.25 EC/s tracking array.
- **RTG:** 0.75 EC/s, always on.
- **Rails vessels:** their `background` forms now also run every 5 s of sim time between day ticks (`runStaleBackground`), so charge moves visibly on rails.
- **Probe drain:** a `stock.probe-computer` module on the probe core draws 0.025 EC/s.
  - `ModuleDefinition.needs` names the resource that a part's control source runs on.
  - `controlProblem` in the sim gives `no-source` or `no-power`. Control commands are refused with that reason ("no power: …"), and `VesselSnapshot.uncontrolled` carries it.
  - `vessel:power-depleted` fires once when a vessel runs out. The web shows the "Uncontrolled" chip (`UncontrolledBadge.svelte`) and an "Out of power" toast.
- **Transmission:** each bit costs the strongest antenna's power × 0.2 EC per Mbit; a radio sends only what its charge pays for.
- **Budget:** `powerBudget` in core, from each module's new `power(config)` descriptor (rate, sun, capacity).

## What surprised me

- A first version put the drain on `ModuleCommand` itself, which broke two things:
  - old saves keep a command module config of `undefined`, so `config.drain` threw on resume;
  - its `background` hook gave every crewed vessel a `backgroundAt`, which changed the frozen save fixtures.

  The drain is now a separate module that only the probe core has.
- On rails a panel used to charge only at the day tick, six game hours apart, so at 1× nothing moved for hours. Hence the 5 s refresh.
- The "bell" that the plan names does not exist yet; plan 205 builds it. Until then the notice is a toast keyed `power`.
- Plan 203 (debug API) also bumps the save format. Whichever plan merges second renumbers its migration.

## Decisions made (link ADRs)

- ADR 0214: the sunlight API and sampling, the flux reference, the shadow model, the panel modes, the RTG, `needs`, the transmit cost and the 5 s background refresh. ADR 0171 notes that ADR 0214 extends it.

## Open questions / follow-ups

- The Hangar does not show the power budget yet (plan 218).
- The "Uncontrolled" chip covers `no-source` and `no-power`; plan 200 adds the empty-pod case (crew aboard).

## Verification output

See the plan's Log for the commands and their results.
