# 0192 — Discovery science: seeded facts, noisy measurements, data levels in the lab, claims judged by a proper scoring rule

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 129
**Builds on:** ADR 0099 point 5 (`stock.science-depth`: `classic` or `discovery`), 0178 (science results and data items), 0180 (the body dossier), 0123 (capacity key `lab`), 0113 (the reputation ledger), 0186 (a sim-owned PRNG state in the save).

## Context

Plan 129 adds the optional `discovery` science depth. Open questions:

- what a fact is and where it comes from;
- how an instrument measures it;
- what the data levels are, and what processing costs;
- how a claim is judged, and how reputation follows;
- what is saved;
- what `classic` keeps.

## Decision

1. **Fact kinds are registered data** (`ctx.discoveryFacts`, `defineDiscoveryFact`). Each kind has:
   - `chance`: the probability that a body has it;
   - `range`: the `[min, max]` of its value when present;
   - `unit`;
   - `tolerance`: how close a claim must be;
   - `resolution`: the raw error, one standard deviation;
   - `instruments`: the data experiments that measure it.

   An absent fact has value 0, so "none" is a claimable answer.

2. **Facts come from the world seed and are never saved.** Every body that is not a star gets one of each kind. Its draw comes from `createRng(streamSeed(seed, 'discovery.fact:<body>:<kind>'))`, so adding a body or a kind does not move the others.

3. **A measurement is part of the science result.** With `discovery` on, `makeResult` of an experiment listed in a kind's `instruments` adds `meta['discovery:<kind>']`. Its value is the truth plus `resolution × N(0, 1)`, floored at 0.
   - The normal draw comes from the world's `discovery` stream: `SaveDiscovery.rng`, seeded from `streamSeed(seed, 'discovery')`.
   - The stock experiment module copies the result's `meta` onto the data item.
   - Samples carry no measurement.

4. **Data reaches the lab when it is credited.** A transmitted, delivered or recovered item that carries measurements becomes one dataset per measurement: `{ id, body, fact, level: 'raw', value, sigma }`.

5. **Levels and processing.**
   - The levels run raw, then calibrated, then derived, with error factors 1, 0.5 and 0.25.
   - `discovery-process { dataset }` starts the next level. It takes `DISCOVERY_PROCESS_DAYS` (2 days to calibrate, 5 to derive) and finishes on the first world tick at or after its end.
   - At once, at most the primary site's `lab` capacity of datasets are in processing. A null capacity means no limit.
   - On completion, the error scales by the level's factor: `value = truth + (value − truth) × σ'/σ`. The error therefore shrinks exactly; it is not redrawn.

6. **Claims and review.**
   - `discovery-claim { body, fact, value, confidence }` takes a confidence in [0.5, 1]. Only one open claim per fact is allowed.
   - Review happens on the first world tick at or after `DISCOVERY_REVIEW_DAYS` (3) days.
   - The claim is correct when `|value − truth| ≤ tolerance`.
   - The reputation change is the scaled Brier score: `DISCOVERY_REPUTATION × (1 − 4(o − c)²)`, with `o` = 1 if correct, else 0.
     - The score is proper, so stating your true belief pays best.
     - Confidence 0.5 scores 0.
     - A wrong claim at 0.9 costs 2.24 × the base.
     - A right claim at 0.9 earns 0.96 × the base; at 0.6 it earns 0.36 × the base.
   - **Priority:** the first accepted claim of a fact is marked `priority`. A later correct claim of that fact gains `DISCOVERY_SECOND_FACTOR` (0.25) of its score; losses are not reduced.
   - Reputation is booked as `discovery.review` with the economy on.
   - The event `discovery:reviewed` fires either way.

7. **Save:** `SimSave.discovery?` holds `{ rng, next, data, claims }`. It is optional and absent until something happened, so there is no format bump.

8. **Snapshot:** `Snapshot.discovery`, only with `discovery` on, holds:
   - the facts per body (kind, label, unit, open or settled, with the accepted value);
   - the datasets;
   - the claims with their verdicts;
   - the lab slots.

   The truth of an open fact is never in the snapshot.

9. **`classic` runs none of this:**
   - no meta on results;
   - no datasets;
   - the commands refuse;
   - the tick does nothing;
   - there is no snapshot field.

   Classic points are credited as before in both depths (ADR 0099: they stay available beside discovery).

10. **UI:**
    - The body dossier gains a Discovery entry with the body's facts, datasets and claims with their verdicts.
    - The Mission Center lists pending reviews as upcoming events.

## Consequences

- Mods add fact kinds as data; a planet pack's bodies get facts without code.
- Rival agencies (ADR 0190) do not claim yet. Priority is per fact, so their claims can join later without a save change.
- Changing a kind's `chance` or `range` changes the facts of existing worlds. Fact kinds are content, and that is accepted, as with bodies.
