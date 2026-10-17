# 061 — Aurora curtains

**Plan:** plans/061-aurora-curtains.md · **Session:** aurora session (Claude, 2026-10-17) · **ADR:** [0093](../decisions/0093-aurora-curtains-as-a-compile-time-march-variant.md) · **Research:** [three.md](../research/three.md) (plan 061)

**Status when written: criteria met.** Not measured on M1/M2, Intel or a phone-class GPU (none here), and no person has judged the look yet: the look review below is mine.

## What was done

| Where | What |
|---|---|
| `aurora-model.ts`, `test/aurora-model.test.ts` (new) | magnetic axis and frame, oval, emission profile, curtain footprint (folds, streaks, gaps, filter), night weight, gate (`auroraStrength`), shell intervals, CPU oracle `auroraAlongRay`; 24 tests |
| `shaders/aurora.glsl.ts` (new), `shaders/planet.glsl.ts` | the GLSL twin (constants imported from the model); the march and its two places in the pass (background and in front) |
| `planet.ts`, `renderer.ts`, `presets.ts`, `environment.ts` | `auroraSteps` 0 / 8 / 12; uniforms; the two programs (`setAuroraLive`, `auroraVariantFor`) and their precompile; the body's flag read from its atmosphere |
| `core/src/schemas.ts`, `version.ts`, `test/body-aurora.test.ts` | `atmosphere.aurora?: boolean`, API 0.1.24 |
| `docs/journal/assets/061-*.jpg` | ground at night in the oval, 250 km above it, the same place by day, half rung |

## Method

Production builds with `NODE_ENV=development vite build` (so `__orbital` exists) of the working tree (`after`) and of a clean `git archive` of HEAD (`base`, commit ca5a5c7, with plan 060 in both), served by a 20-line Bun static server on 5246 (with a POST route that saves canvas JPEGs), one tab of the built-in pane at a time, canvas forced to 1920 x 1080 at ratio 1, rAF stubbed, vessel of the VAB's two-stage example moved by synthetic snapshots (a cloned snapshot with the position and an upright orientation; the live sim kept posting its own). `thr` = minimum of 10 windows of `benchmark(8)`, `sync` = minimum of 10 means of 8 `benchmark(1)`. Every number is from a page load after one earlier load of the same build and preset (new shader text runs 2 to 3 times slower on its first load in the hidden pane). Scenes: the journal 039 set (pad with the real sun, 3 km, 12 km, orbit 100 km, the 1.6 km hillside approximated at 26.5 km east and 5.5 km north, 1.9 km up), plus `day at the oval` (sun 30 degrees, camera at magnetic colatitude 24 degrees, 60 m up), `night at the launch latitude` (sun -60, camera at the site) and the aurora scenes: `ground` (sun -60 degrees, magnetic colatitude 24 degrees on the midnight meridian, 60 m up, camera looking up from 100 m below) and `orbit` (250 km up at colatitude 30 degrees).

## Frame times (thr / sync ms, base then this plan)

| Scene | `high` | `medium` |
|---|---|---|
| pad | 16.94 / 17.80 to 16.79 / 17.59 | 13.29 / 14.76 to 13.33 / 15.33 |
| 3 km | 14.92 / 15.85 to 14.89 / 15.65 | 11.98 / 13.54 to 11.96 / 13.51 |
| 12 km | 12.28 / 12.99 to 12.19 / 13.21 | 10.40 / 12.00 to 10.42 / 11.89 |
| orbit, 100 km | 6.46 / 7.15 to 6.42 / 7.05 | 5.86 / 6.54 to 5.89 / 7.29 |
| hillside | 14.00 / 14.88 to 13.96 / 14.77 | 11.65 / 12.49 to 11.75 / 12.92 |
| day at the oval | 8.96 / 9.59 to 8.89 / 9.52 | 8.08 / 8.76 to 8.05 / 8.74 |
| night at the launch latitude | 9.22 / 9.84 to 9.14 / 9.80 | 8.24 / 8.85 to 8.24 / 9.06 |
| **aurora, ground** | 7.54 / 8.29 to **10.51 / 11.45** | 7.09 / 7.77 to **9.49 / 10.34** |
| **aurora, 250 km** | 3.24 / 3.90 to **6.20 / 6.81** | 3.23 / 3.99 to **5.35 / 6.05** |

Where the aurora is off the throughput differs by at most 0.15 ms (`high`) and 0.10 ms (`medium`), either way: no measurable cost. The sync column has about 0.5 ms of noise (medium orbit reads +0.75 sync and +0.03 thr). In the aurora scenes the march costs +3.0 ms (`high`, 12 steps) and +2.4 ms (`medium`, 8 steps) against the sky-only scene; the worst aurora scene is 11.45 ms sync, the budget is 16.7 (`high`) and 13.3 (`medium`). Half rung (`high`, aurora ground): 7.88 / 8.71 ms against 10.51 / 11.45 at full resolution.

**What the first comparison got wrong.** The first `base` was a build before plan 060's commits landed in HEAD; against it the build with the aurora always compiled in read +1.0 to +1.5 ms at the pad, 3 km and 12 km. A second build with the aurora compiled out until it is in reach read the same +1.0 ms, and a new `base` of the new HEAD read the same as both. The +1 ms was the difference between two HEADs (plan 060's commits and the clock of the machine), not the aurora. The variant design of ADR 0093 (two programs) was built in response and is kept as a precaution; **the cost of a never-taken branch in the single program was never isolated** and may well be zero. And a first attempt at the new `base` was a copy whose `node_modules` links resolved into the main tree and built my own code (found because the built chunk contained `uAuroraAxis`; research `three.md`).

## Hitch

Preset switches (nine `setPreset` plus first frame in the hidden pane, 1920 x 1080 at ratio 1, a page whose precompile has finished), ms: this plan on the day scene 67, 734, 46, 625, 292, 50, 232, 622, 54, on the aurora scene 257, 718, 51, 714, 202, 52, 257, 678, 60; base on the day scene 81, 716, 74, 686, 228, 64, 191, 712, 61. The same pattern (the switch to `high` at this size costs 600 to 750 ms in both builds; it is the shadow map and the targets, not shader compiles); the aurora adds none. The first frame in reach of the aurora (a swap to the program with the march, compiled ahead by `precompile()`) costs 99 ms on `high` and 95 ms on `medium`, once per page; switching back reads 1.6 ms.

## Look review against `visual-direction.md`

The ground view (`061-ground-night.jpg`) is the picture the plan asked for: green curtains with vertical rays overhead, a red fringe on the poleward side, the stars through them, the clouds as dark silhouettes in front (they hide it, as they should). It moves slowly (tens of seconds per fold). Honest weaknesses, in order:

1. **Grain.** The jitter is per-pixel white noise; in the faint parts of the sheet (the sky off the curtain, the horizon glow at 100 percent zoom) it reads as film grain. The bloom hides some of it; a temporal accumulation is not in the pass.
2. **Soft.** The sheets are widened by the step spacing so that 12 steps do not sample at random; the curtains have no sharp bright lower edge. A real curtain has one; the green profile has the sharp lower edge in height, which shows from the ground as a bright base only at some angles.
3. **From orbit** (`061-orbit-night.jpg`) the ring is a soft green and violet band with the whole disc below it tinted green: the camera at 250 km sees the oval's glow across a wide area through a long path, and the blue and violet limb is the atmosphere's. At full strength it was overexposed (the exposure there follows the dark ground); `orbitShare` 0.2 is a taste setting that a person should judge.
4. **The look of the oval** (width 3.2 degrees, red share 0.14, gain 0.3) is art, not a measurement; the sources do not give widths or the red height (research).
5. **The hatch** the interleaved-gradient jitter of the pass drew on the smooth sheets is gone (white noise instead).

Day: none (`061-day-none.jpg`); the low-latitude night has none either (the launch site at 0.009 rad of latitude is at magnetic colatitude about 87 degrees).

## What surprised me

- **`patch` is a reserved word** in GLSL ES 3.00: the planet pass drew black with the error only in the console; `tsc` and `vite build` pass (the same lesson as journal 056's shader errors).
- The first measurement of "cost" was a difference between two HEADs. The lesson is the one of journal 054: compare against a build made from the same tree in the same hour, and check that the base really is the base (a built chunk that contains a name only the new code has).
- **The scale of the body matters to the geometry:** at 600 km radius the horizon of a 110 km curtain is 32 degrees of arc away, so the gate's reach is large (the oval is seen from 26 degrees of arc at 0.7 of the geometric reach) and the oval's 23 degrees of colatitude is 240 km from the pole.
- The orbit view is a long path through a thin emitter; the first, unfiltered build was a screen of grain and the filter (widening the sheet by the sample spacing, energy preserving) is what made 12 steps usable.

## Not met / not done

- M1/M2, Intel, phone GPUs: not available; the governor covers slower GPUs.
- The aurora does not light the ground or the clouds (they do not glow); a per-body magnetic axis; sound. No draft plan was opened for these: they are small follow-ups listed in ADR 0093.
- The roadmap page has no entry for plan 061 (nothing to remove).
- A uniform-gated single-program design was not measured against the variant.

## Verification output

```
bun test packages/renderer      576 pass, 0 fail
bun run test                    1309 pass, 0 fail
apps/web vitest --run           821 pass, 0 fail (91 files)
bun run typecheck               all packages and svelte-check: 0 errors
bun run build                   done
bun run docs:check              OK (71 plans, 92 ADRs)
prettier --check                clean on packages/renderer, packages/core, the plan, journal, ADRs and STATUS
```
