# 127 — Range safety

**Plan:** [plans/127-range-safety.md](../plans/127-range-safety.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0155](../decisions/0155-range-safety-fans-impacts-at-staging-and-penalties.md) (new), [0097](../decisions/0097-sites-space-center-in-3d-free-grid-bases-and-range-safety.md), [0021](../decisions/0021-debris-lifecycle-and-time-warp.md), [0182](../decisions/0182-buoyancy-water-seabed-slices-wet-landed.md), [0113](../decisions/0113-economy-core-ledger-costs-charges-recovery.md) · **Research:** none

**Status when written: criteria met here.**

## What was done

| Where | What |
|---|---|
| `packages/core/src/range-safety.ts` | `safeFan` (5° azimuths, 20 to 200 km track, 75 % water, 50 km clear of sites), `inFan`, `fanWidth`, `conicImpact` (the debris conic to the reference radius, flight time by Kepler), `dropProblem`, `headingOf`, `latLonOf`, `nominalDrops` (the Launch screen's estimate), `RANGE_PENALTIES`, `SaveRange`, `RangeSnapshot`; `travel` exported from `site-templates.ts` |
| core contracts | `SimSave.range?` (optional in format 5), event `range:violation`, `Snapshot.range?`; API_VERSION 0.1.55 |
| `packages/sim/src/range.ts` | the drop judged at the `stage` command (refused under `hard`, booked once under `cost`), the ascent azimuth at 2 km for vessels loaded at a site, fans cached per run, the snapshot warnings; `costMultiplier` exported from `economy.ts` |
| web | `lib/range/range-model.ts` (the rule from the world or its preset, the Launch panel, the HUD line), the Launch screen's range panel, `RangeBadge` in the flight HUD |
| tests | core `range-safety.test.ts` (8), sim `range.test.ts` (4), web `range/range-model.test.ts` (4) |

## What surprised me

- **The sim has no Δv model.** Stage Δv lives in `apps/web/src/lib/delta-v.ts`, so the sim cannot predict a design's drops before launch. The drop is judged at staging from the real state instead (ADR 0155 point 3), and the Launch screen shows a nominal estimate from the page's own Δv; the acceptance criterion's "launch is refused" is the staging that would drop the stage.
- **The player picks no azimuth.** Refusing launches outside the fan under `hard` would forbid every launch from an inland site; the azimuth is measured at 2 km and penalised instead.
- **Coasts are fractal.** No azimuth of the equatorial coast template is all water to 400 km on the default seed; the band is 20 to 200 km (where first stages fall) at 75 % water. The Legacy space center (0°, 0°) stands inland: its fan is empty, harmless because the Legacy world runs the Sandbox preset (rule off).
- **`waterAt` and the site templates' `seaEast` disagree a little.** The templates read the biome map below `landStart`; the fan reads the terrain's water (below `SEA_LEVEL`, and lakes) so it matches what a splashdown meets.
- Same environment notes as before: `sim-host-script-worker.test.ts` (2 vitest) fails on this machine on main too.
