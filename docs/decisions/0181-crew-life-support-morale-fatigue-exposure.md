# 0181 — Crew simulation: life support, morale, fatigue, g-load and radiation

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 107
**Builds on:** ADR 0100 points 3 and 4 (each aspect a rule, background closed forms), 0109 point 3 (Career standard and hardcore), 0176 (roster, seats, the death rule), 0171 (world tick and background).

## Context

The rules `stock.life-support` (`off` / `simple` / `full`), `stock.crew-morale`, `stock.crew-rest` and `stock.crew-exposure` exist with their preset values, but nothing reads them. Open: what is consumed and at what rates, how consumption stays exact under warp, what a shortage does and when, the morale and fatigue formulas and their effect, how g-load and radiation count, what is predicted, and what is saved.

## Decision

1. **Consumables are resources** with `flowMode: 'vessel'`. Crew draw them from any container on the vessel.
   - `simple`: `stock.supplies`, 1 unit per crew member per day.
   - `full`: `stock.oxygen`, `stock.water` and `stock.food`, 1 unit each per crew member per day. Carbon dioxide must be scrubbed: modules that declare `scrubber: (config) => { crew, charge }` serve up to `crew` people while drawing `charge` electric charge per served person per day.

   A day is the root body's rotation period, as for salaries (ADR 0176). The rates are core constants (`LIFE_SUPPORT_RATES`).
2. **Exact under warp.** After every flight step and rails chunk, each crewed vessel's interval is integrated piecewise linearly. Rates are constant until a consumable runs out (or the scrubbers' charge does), so the next event time is `amount / rate`. The interval is cut there, and the run-out is dated exactly whatever the warp. The same pass serves vessels in flight and on rails.
3. **Shortage.** When a consumable runs out (or scrubbing falls short: `co2`), every member aboard gets a shortage `{ resource, since }`, and `crew:shortage { vessel, member, resource, time }` is emitted with the exact time.
   - **Grace:** oxygen and CO2 1 800 s; water and supplies 3 days; food 10 days.
   - **Past the grace,** the death rule applies to that member (ADR 0176 point 7: lost, missing, or nothing with `off`).
   - **Resupply** clears the shortage (`crew:resupplied`).
4. **Morale** (`stock.crew-morale` on), `m ∈ [0, 1]`, starts at 1. It relaxes towards a target with a time constant of 1 day, which is exact for a constant target over an interval. The target is `1 − 0.01 × days aboard − 0.3 × max(0, crowding − 0.5) − 0.4 × (in shortage)`, where crowding is crew aboard over the vessel's seats.
5. **Fatigue** (`stock.crew-rest` on), `f ∈ [0, 1]`, rises by 1 per 2/3 day while the vessel is in flight mode (working), and falls by 1 per 1/3 day on rails (resting).
6. **Performance** is `(0.6 + 0.4 m) × (1 − 0.4 f)`. With an aspect off its term is 1. It scales the reported quality factors (`abilities`) in `VesselSnapshot.crew`: a quality, never a tool (ADR 0098 point 3).
7. **G-load** (`stock.crew-exposure` on). In flight, the proper acceleration is `Δv / Δt − g`.
   - Above `6 g × gTolerance` (the trait factor), the excess in g·s builds a stress that drains at 1 g·s per second.
   - Past 3 g·s the member blacks out for 8 s: `crew:g-loc`, and a `glocUntil` time.

   **Radiation** accumulates a dose: 0 inside an atmosphere or on the home surface, 1e-5 mSv/s elsewhere in the home sphere of influence, 5e-5 mSv/s beyond it. The dose is recorded and shown, with no effect yet.
8. **Prediction.** `VesselSnapshot.lifeSupport = { mode, crew, consumables: [{ resource, amount, rate, timeLeft }] }`. `timeLeft` is `amount / rate` for each consumable, and for `co2` the scrubbers' charge time (or 0 when scrubbers are short). The crew card shows it and the causes of morale and fatigue.
9. **Save.** The member fields `morale`, `fatigue`, `dose`, `gStress`, `glocUntil` and `shortages` are optional in `SimSave.crew` (format 5 unchanged). Consumables are resources in containers, saved as module state.
10. **Stock.** Resources: supplies, oxygen, water, food. Parts:
    - a life-support pack (6 crew-days of everything);
    - a scrubber (serves 3, 10 EC per served person per day).

    The command pod is unchanged. The launch flow seats nobody yet (plan 108), so no existing flight changes.

## Alternatives considered

- **CO2 as a stored resource filling a cabin tank:** rejected. Containers have no capacity query, and CO2 that only matters as "scrubbed or not" needs no store.
- **Per-step Euler consumption:** rejected. Under warp it would date a run-out to the end of a chunk, hours late.
- **Morale and fatigue changing what the crew can do:** rejected (ADR 0098). They scale quality factors only.

## Consequences

- **Mod API:** module hook `scrubber`; core `LIFE_SUPPORT_RATES`, `SHORTAGE_GRACE`, `performanceOf`; additive, `API_VERSION` patch bump.
- **Protocol:** `VesselSnapshot.lifeSupport`, crew entries with `morale`, `fatigue`, `dose`, `performance` and `shortages`; events `crew:shortage`, `crew:resupplied`, `crew:g-loc`. **Save:** optional member fields.
- **Follow-ups:** 108 (seating crew at launch, so these apply in play), 109 (EVA), 111 (vessel panel), radiation limits.
