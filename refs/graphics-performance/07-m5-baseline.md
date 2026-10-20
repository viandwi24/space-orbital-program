# 07 — The M5 baseline (plan 251) and what plan 252 changed

Measured 2026-10-20 on the MacBook Pro M5's built-in display with `apps/web/scripts/measure-graphics.ts` (viewport 1512 × 945 CSS, device scale factor 2, headed Chromium on the Metal backend, GPU `ANGLE (Apple, ANGLE Metal Renderer: Apple M5)`, development build, governor off except in the trace). The numbers are "sync ms": the minimum over 10 windows of the mean of 6 single frames (journal 054 method), two-stage example on the pad, the scenes of journals 039 and 050. The hillside scene is left out of the conclusions: it varied from 2.7 to 10.6 ms between rows of the same configuration.

Raw data in `data/`: `m5-run1-baseline.json` (before plan 252, AC), `m5-run2-after-252.json` (battery: kept for the record, see below), `m5-run3-after-252-ac.json` (252 code with a 2.07 Mpx budget, AC), `m5-run4-ablation-251-ac.json` (before plan 252, ablation applied at page load, AC), `m5-run5-final-252-ac.json` (252 with the final 1.75 Mpx budget, AC).

## Power state

| Run | Code | Power | Reading |
|---|---|---|---|
| 1 | before 252 | AC, charging, 32 % | valid |
| 2 | 252, 2.07 Mpx | **battery, 28 % and falling** (the charger came off between runs 1 and 2) | table valid (it matches run 3 within 0.4 ms); **trace not usable**: a flat 30 ms interval is the 30 fps cap of Chrome's Energy Saver mode near 20 % battery, and the governor sank to `low` |
| 3, 4, 5 | as listed | AC, charging, 22 to 40 % | valid |

`pmset -g therm` recorded no thermal or performance warning in any run (it is stored in each JSON's `notes`).

## 1. Frame time by pixel ratio: before plan 252 (run 1)

| Preset, pixel ratio (canvas) | pad | 3 km | 12 km | orbit |
|---|---|---|---|---|
| medium, 1 (1512x945) | 9.65 | 9.35 | 10.30 | 6.20 |
| medium, 1.5 (2268x1417) | 19.07 | 20.38 | 22.40 | 12.97 |
| medium, 2 (3024x1890) | 31.87 | 36.12 | 39.45 | 22.58 |
| high, 1 (1512x945) | 13.15 | 12.27 | 13.52 | 7.52 |
| high, 1.5 (2268x1417) | 26.20 | 26.10 | 28.35 | 16.60 |
| high, 2 (3024x1890) | 43.65 | 47.32 | 50.37 | 27.10 |

- **Cost follows pixels.** At the pad `high` goes 13.15 : 26.2 : 43.65 ms for 1 : 2.25 : 4 pixels (1 : 1.99 : 3.32). Retina `high` (43.7–50.4 ms) is 2.6 to 3 times over the 16.7 ms budget.
- **`high` against `medium` is 1.36–1.37× at every ratio on the M5,** not the 4× seen on the M2 (research 02): here the weight of `high` is the pixel count, not its extras.

## 2. What each `high` extra costs (ablation, ratio 2, before plan 252, run 4)

Each switch is applied at page load, before the programs compile (`renderer.debug.setFeature`, `orbital.graphics.features`), and takes one `high` extra down to what `medium` draws. The first baseline (run 1) switched them at run time, and the ones that change a shader define (`cloudShadow`, `shafts`, `clouds`, `terrain`, `all`) read 2.5–3× *slower* than plain `high`: a program compiled after the page loaded reads 2–3 times slow in this setup (journal 050). Those rows are not used.

| Switch | pad (Δ) | 3 km (Δ) | 12 km (Δ) | orbit (Δ) |
|---|---|---|---|---|
| none (plain preset) | 41.4 | 44.5 | 48.1 | 26.4 |
| shadowMap | 42.9 (+1.5) | 45.9 (+1.3) | 49.2 (+1.1) | 26.8 (+0.4) |
| cloudShadow | 41.1 (-0.3) | 44.3 (-0.2) | 47.6 (-0.5) | 25.6 (-0.8) |
| shafts | 39.7 (-1.7) | 42.6 (-1.9) | 47.2 (-0.9) | 27.0 (+0.6) |
| clouds | 43.5 (+2.1) | 46.5 (+1.9) | 48.1 (+0.0) | 25.8 (-0.7) |
| terrain | 44.1 (+2.6) | 46.7 (+2.2) | 49.7 (+1.6) | 27.4 (+0.9) |
| aurora | 43.1 (+1.7) | 46.1 (+1.6) | 49.2 (+1.1) | 26.6 (+0.2) |
| tufts | 41.0 (-0.4) | 45.7 (+1.1) | 48.5 (+0.4) | 26.2 (-0.2) |
| msaa | 37.6 (-3.8) | 41.8 (-2.7) | 44.5 (-3.5) | 22.6 (-3.9) |
| all | 29.1 (-12.3) | 34.5 (-10.0) | 37.3 (-10.7) | 19.7 (-6.8) |

- No extra is a large share by itself. **`msaa` 4 → 0 is the biggest (−2.7 to −3.9 ms)**; `shadowMap`, `aurora`, `tufts`, `shafts`, `clouds`, `terrain` and `cloudShadow` are each within ±2.6 ms of noise. All switches together save 12.3 / 10.0 / 10.7 / 6.8 ms (30 % at the pad, 22–25 % elsewhere): `high`'s extras together matter, none on its own does. The pixel count is the other 70 %.
- On `medium` every switch is a no-op except `msaa` (a switch only lowers `high`'s values to `medium`'s).

## 3. The governor at ratio 2, before plan 252 (run 1)

120 s on the pad, `high`, governor on: **9522 frames (79 fps average), p50 10.0 ms, p95 20.1 ms, p99 21.0 ms.** The governor moved between `high` at 100 % and 70 % (the 70 % rung also draws the planet pass at half size) 5 times in the two minutes, so the picture was soft most of the time and went back to full size by retry: the stutter of research 01 §4. (The share over 16.7 ms in that file, 25.1 %, counts the steady 60 fps frames that read 16.7 ms; the script now allows 1 ms of jitter.)

## 4. After plan 252

**Frame time, final budget of 1.75 Mpx (run 5, AC):**

| Preset, pixel ratio (canvas) | pad | 3 km | 12 km | orbit |
|---|---|---|---|---|
| medium, 1 (1512x945) | 9.62 | 9.18 | 10.20 | 6.07 |
| medium, 1.5 (2268x1417) | 12.18 | 12.20 | 13.47 | 8.72 |
| medium, 2 (3024x1890) | 13.58 | 13.08 | 14.48 | 9.32 |
| high, 1 (1512x945) | 12.38 | 10.75 | 11.90 | 6.57 |
| high, 1.5 (2268x1417) | 15.07 | 13.97 | 15.43 | 9.38 |
| high, 2 (3024x1890) | 16.53 | 15.10 | 16.75 | 9.88 |

| Retina `high` (ratio 2), sync ms | pad | 3 km | 12 km | orbit |
|---|---|---|---|---|
| before (run 1) | 43.65 | 47.32 | 50.37 | 27.10 |
| 252 with a 2.07 Mpx budget (run 3) | 17.75 | 16.78 | 18.58 | 10.75 |
| **252 with 1.75 Mpx (run 5)** | **16.53** | **15.10** | **16.75** | **9.88** |

- Retina `high` is **2.6× / 3.1× / 3.0× / 2.7× cheaper** and, at ratio 2, 4.2 ms dearer than `high` at ratio 1 at the pad (it was 30 ms dearer).
- **The budget value.** The frame cost follows the planet pass's pixels, and at 2.07 Mpx the pad and 12 km read 17.8 and 18.6 ms with the governor still bouncing between 100 % and 85 %, so the value was lowered to 1.75 Mpx (the pass runs at 0.55 of the side on this display, 1.73 Mpx).
- `medium` at ratio 2 reads 13.6 / 13.1 / 14.5 / 9.3 ms (before: 31.9 / 36.1 / 39.5 / 22.6).

**What is left of `high`'s extras (252 code, ratio 2, run 3):** all switches together −4.6 / −3.3 / −3.4 / −2.1 ms (25 % at the pad); `msaa` (now 2 samples to 0) −1.9 ms; every other switch within ±1.1 ms.

**The governor on, with the final budget (run 5, AC):** 6818 frames (56.8 fps), **p50 16.7 ms, p95 25.0 ms, p99 25.2 ms; 12 % of the frames over 16.7 ms (+1 ms jitter), 0.1 % over 33.3 ms;** the governor moved 3 times between `high` at 100 % and 85 %, never to another preset. The display runs at 120 Hz, so a frame that just misses 16.7 ms takes the third vsync (25 ms): p95 reads 25 ms with 88 % of the frames on time. Against the same 2.07 Mpx run (run 3: p95 23.3 ms, p99 25.2 ms), the quality stays at full resolution instead of the 70 % + half planet rung of run 1.

**Against the target of plan 252 (p95 ≤ 16.7 ms at the pad, 3 km, 12 km and orbit):** the sync numbers meet it (16.5 / 15.1 / 16.8 / 9.9 ms; 12 km is 0.05 ms over); the interval trace does not (p95 25 ms): the frame has about 0.2 ms of room at the pad and no room for the compositor. Two levers are left: a smaller budget (1.43 Mpx is the half rung's pass, about 1 ms less at the pad, extrapolated) and the governor's rules (lock-aware, no 100 % ↔ 85 % probe): plan 253.

## What the baseline taught

1. Pixels, not features, are most of the frame; `msaa` is the one feature worth lowering by itself.
2. The ablation has to apply a switch before the programs compile.
3. The governor sees only the frame interval. A 30 fps cap (Energy Saver, below 20 % battery) is read as a slow GPU and sinks it to `low`; a 120 Hz display turns a frame that just misses 60 fps into 25 ms. Plan 253's rules should use the vsync period (locked 60/30, not a 55 fps budget) and stop on a cap.
