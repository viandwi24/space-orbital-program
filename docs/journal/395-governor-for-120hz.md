# 395 — Governor for 120 Hz

**Plan:** [plans/395-governor-for-120hz.md](../plans/395-governor-for-120hz.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0338](../decisions/0338-governor-for-120hz.md)

## What was done

| Where | What |
|---|---|
| `renderer/quality-governor.ts` | the lock: target 120 on a 120 tier and screen, 60 otherwise; the fall to 60 at the lowest rung and the way back on evidence (one trial, banned per scene on a miss); TAAU rungs (`taauRungs`, `rungResolution`); the display peak latch and `setDisplayHint`; 6 % steady-judder share at 120 |
| `renderer/presets.ts` | `selectPreset` starts non-Apple GPUs at their tier's preset (GTX 1650 / RTX 3050 `medium`, Iris Xe / 680M `low`) |
| `renderer/renderer*.ts` | `Renderer.taauAvailable` |
| `web/graphics.ts`, `flight-loop.ts`, Settings | `'120'` in the frame-rate setting; `lockCeiling` (tier, Safari 60); battery limit 60 when no choice is saved; refresh probe at load; learned level per backend and lock target with its TAAU rung |

## Tests

Synthetic series in `quality-governor.test.ts`: a steady 9 ms series at 120 Hz steps the TAAU scale before any preset; a series that misses at the lowest rung locks to 60 (every second rAF); a recovered one returns to 120 only after 60 s and on evidence; a trial that misses goes back to 60 and is not repeated in the scene; no TAAU rung changes the drawing buffer or the planet scale. `device-tier.test.ts`: start preset and lock for M5, M2, Iris Xe, 680M, GTX 1650, RTX 3050. `graphics.test.ts`: `'120'`, Safari, battery, learned key.

## Findings

- **The display rate must be latched.** A frame that takes two slots shows rAF intervals of 16.7 ms on a 120 Hz screen; the cadence estimate then reads 60 and the governor judges a 12 ms frame by a 60 budget. The peak (and the rate measured at load) is kept.
- **Evidence that lies is calibrated away.** A work time that reads far under the interval raises `workScale`, so a 120 trial needs a plausible work time or a new scene.
- **Measured on the M5** (`refs/graphics-v2/data/m5-governor-120.json`, Chrome, tier `apple`, 120 Hz, 1285 × 803 at DSF 2, governor on, Automatic, 45 s warm + 30 s per view, load 2.5 to 2.9, AC): the governor ended on `low` at every view with a p95 of 10.1 to 10.3 ms (16.9 at the pad), 27 to 37 % of frames over 8.4 ms and 0 to 5 % over 16.7. **The 120 lock is not held** (acceptance p95 ≤ 8.4 not met). It reached the floor preset without settling at 120, so either the floor itself misses 120 at this window size (the scene costs 9.7 to 11.7 ms by the timestamps, which under-read) or the walk to `low` came from the 60-budget judgement before the display hint reached it (the hint arrives after the 45-frame probe). Not separated in this run.
- Pad p95 16.9 includes two Long Animation Frames (loading).

## Not done

- The lock at 120 on the M5 (acceptance), the 2-minute flight and the M2 and Windows runs [manual].
- A TAAU scale change that allocates nothing (three reallocates the pass target).
- `measure-sunrise.ts` with `STEP_TO`.
- Next step for the 120 lock: log the governor's history per cell in the matrix JSON, and see whether the floor (`low`, which has no TAAU) is what misses; `low` could take TAAU if its post chain were on.
