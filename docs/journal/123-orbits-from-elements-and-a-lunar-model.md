# 123 — Body orbits from elements with secular rates and a lunar model

**Plan:** plans/123-orbits-from-elements-and-a-lunar-model.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode, autopilot · **ADRs:** [0183](../decisions/0183-body-path-models-kepler-rates-series-osculating.md) (new), [0103](../decisions/0103-time-calendar-sun-and-the-real-solar-system.md), [0095](../decisions/0095-gravity-model-per-world-and-a-trajectory-provider.md) · **Research:** [`ephemerides.md`](../research/ephemerides.md) (new)

**Status when written: criteria met here, handed over as `ready/123`.**

## What was done

| Where | What |
| --- | --- |
| `packages/kepler/src/body-path.ts` (new) | `BodyPath` (`kepler`, `kepler-rates`, `series`), `bodyPathState`, `osculatingElements`, `levelAElements`, `AU`, `SECONDS_PER_CENTURY` |
| `packages/core/src/schemas.ts` | `orbit.model`, `orbit.rates`, `orbit.series`; `API_VERSION` 0.1.49 |
| `packages/sim` | `BodyRuntime.path` and `timeOffset` (world epoch), `stateInParent` dispatch, `elementsAt`, `refreshPatchedBodies` after every step, the target approach on osculating elements |
| tests | `packages/kepler/test/body-path.test.ts` (6), `packages/sim/test/body-models.test.ts` (3) |
| docs | ADR 0183, `research/ephemerides.md`, `simulation.md`, mod guide |

## Decisions and deviations

- **The lunar model is the Astronomical Almanac low-precision formula**, not ELP-2000/82: no free primary source for the long theory. The coefficients and the accuracy statement come from an implementation that cites the Almanac (`ephemerides.md`). The series format takes a longer theory as data.
- **J2000 models run on `t + world epoch`.** `kepler` keeps world time, so existing worlds are unchanged.
- **Scripts, the VAB planner and the renderer read the mean conic.** No stock body uses a new model; 124 brings the first, and with it those consumers.
- **SI rates in the data,** with a helper for JPL's per-century rows.
- **The Sun is the root since 122**, so the sim test places its vessel on `stock.home` and measures body positions relative to it.

## Measurements

Errors against JPL Horizons (Table 1 bounds in brackets):

| Body | 2000 | 2020 | 2040 |
| --- | --- | --- | --- |
| EM barycentre λ″ / φ″ / ρ km [20 / 8 / 6 000] | 2.8 / 0.18 / 380 | 7.5 / 0.15 / 3 942 | 5.8 / 0.39 / 531 |
| Mars [40 / 2 / 25 000] | 3.7 / 0.77 / 7 264 | 8.6 / 0.49 / 8 680 | 25.8 / 1.15 / 7 126 |
| Jupiter [400 / 10 / 600 000] | 309.1 / 4.44 / 287 983 | 41.5 / 1.22 / 442 347 | 40.5 / 0.62 / 194 247 |
| Moon λ° / β° / ρ % [0.3 / 0.2 / 0.5] | 0.026 / 0.032 / 0.011 | 0.037 / 0.025 / 0.066 | 0.068 / 0.014 / 0.039 |

- SOI entry into a `kepler-rates` moon (5 % faster than its conic): within 0.01 s of the geometric crossing. The fixed conic would have entered more than 1 s apart.
- Benchmark: ten `kepler-rates` bodies add 0.9 to 1.8 µs per step here (budget 50 µs; indicative).

## Follow-ups

- 124: the Sol pack data; scripts' `bodies[].state`, the trip planner and the renderer on the models. 125: DE440. Table 2's long-span terms.

## Verification output

```text
VERIFY
```
