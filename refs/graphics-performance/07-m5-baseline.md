# 07 — The M5 baseline (plan 251) and what plan 252 changed

Measured 2026-10-20 on the MacBook Pro M5's built-in display with `apps/web/scripts/measure-graphics.ts` (viewport 1512 × 945 CSS, device scale factor 2, headed Chromium on the Metal backend, GPU `ANGLE (Apple, ANGLE Metal Renderer: Apple M5)`, development build, governor off except in the trace). The numbers are "sync ms": the minimum over 10 windows of the mean of 6 single frames (journal 054 method). Raw data: `data/m5-run1-baseline.json` (the 251 code) and `data/m5-run2-after-252.json` (the 252 code).

## Power state (the owner allowed battery; the charger came off mid-run)

| Run | Code | Power at the start | Notes |
|---|---|---|---|
| 1 | 251 (`17419d93`) | AC, charging, 32 % | no thermal or performance warning recorded |
| 2 | 252 (`ed605d49`) | **battery, 28 %, discharging** (13 % by the end) | no thermal warning recorded; the governor trace is not usable (below) |

The M5 was unplugged between the runs, so run 2's frame times were taken on battery. The sync table is not affected in a way we can see (`medium` at ratio 1 reads 9.65 ms in run 1 and 9.55 ms in run 2, the same code path), so the comparison below stands; run 2 is re-taken on AC to confirm (see "Rerun").

## 1. Frame time by pixel ratio (sync ms, two-stage example on the pad)

**Run 1, the code before plan 252 (AC):**

| Preset, pixel ratio (canvas) | pad | 3 km | 12 km | orbit | hillside |
|---|---|---|---|---|---|
| medium, 1 (1512 × 945) | 9.65 | 9.35 | 10.30 | 6.20 | 3.03 |
| medium, 1.5 (2268 × 1417) | 19.07 | 20.38 | 22.40 | 12.97 | 6.05 |
| medium, 2 (3024 × 1890) | 31.87 | 36.12 | 39.45 | 22.58 | 10.12 |
| high, 1 | 13.15 | 12.27 | 13.52 | 7.52 | 3.33 |
| high, 1.5 | 26.20 | 26.10 | 28.35 | 16.60 | 6.33 |
| **high, 2** | **43.65** | **47.32** | **50.37** | **27.10** | **10.60** |

- **Cost follows pixels.** At the pad `high` goes 13.15 : 26.2 : 43.65 ms for 1 : 2.25 : 4 pixels (1 : 1.99 : 3.32), `medium` 1 : 1.98 : 3.30. Retina `high` (43.7–50.4 ms) is 2.6 to 3 times over the 16.7 ms budget.
- **`high` against `medium` is 1.36–1.37× at every ratio on the M5,** not the 4× seen on the M2 (research 02). The weight of `high` here is the pixel count, not its extras.

**Run 2, the code with plan 252 (battery, see above):**

| Preset, pixel ratio | pad | 3 km | 12 km | orbit | hillside |
|---|---|---|---|---|---|
| medium, 1 | 9.55 | 9.12 | 10.02 | 5.85 | 2.87 |
| medium, 1.5 | 13.85 | 14.62 | 15.98 | 9.88 | 4.25 |
| medium, 2 | 14.67 | 14.62 | 16.02 | 9.92 | 4.50 |
| high, 1 | 11.98 | 10.50 | 11.62 | 6.45 | 2.92 |
| high, 1.5 | 16.82 | 16.57 | 18.22 | 10.80 | 4.37 |
| **high, 2** | **17.48** | **16.57** | **18.83** | **10.70** | **4.52** |

- Retina `high` falls from 43.7 / 47.3 / 50.4 / 27.1 ms (pad / 3 km / 12 km / orbit) to **17.5 / 16.6 / 18.8 / 10.7 ms**: 2.5×, 2.9×, 2.7× and 2.5× less. Ratio 1.5 and 2 now cost almost the same, because the budgeted planet pass is the same size at both and the rest of the frame is cheap.
- `high` at ratio 1 is 1.1–1.2 ms cheaper than before (the baked cloud-shadow map).
- The pad and 12 km at ratio 2 are 0.8 and 2.1 ms over 16.7 ms: the budget value (1080p pixels, ADR 0232) is the lever left, and the final value is chosen from these numbers.

## 2. What each `high` extra costs (ablation, ratio 2)

A switch takes one `high` extra down to what `medium` draws (plan 251, `renderer.debug.setFeature`). Valid readings from run 1 (`high`, ratio 2, plain `high` 46.0 ms at the pad):

| Switch (high → medium) | pad | 3 km | 12 km | orbit | Reading |
|---|---|---|---|---|---|
| shadowMap 4096 → 2048 | −1.7 | −1.1 | +1.9 | +1.5 | within noise |
| aurora 12 → 8 steps | −3.2 | −2.7 | +3.2 | −1.5 | small |
| tufts 28 000 → 10 000 | −5.5 | −2.9 | +3.1 | −1.5 | pad only (the grass is at the site) |
| **msaa 4 → 0** | **−8.5** | **−6.3** | **+0.5** | **−4.8** | the largest valid saving; 4 samples of an RGBA16F target |

On `medium` every switch is a no-op except msaa (−4.2 ms at the pad), as a switch only lowers to `medium`'s values.

**Not valid in run 1: cloudShadow, shafts, clouds, terrain and all.** They read 2.5–3× *slower* than plain `high` (cloudShadow 122 ms at the pad), which a feature taken down cannot do. They change shader defines at run time, and a program compiled after the page loaded reads 2–3 times slow in this setup (journal 050: "the first load compiles, the second is measured"). Run 2 shows the same on `shafts`, `clouds`, `terrain` and `all`, while `cloudShadow` is a no-op there (252 already uses the baked map). The ablation is re-taken with each switch applied at page load, before the programs compile (script commit "applies each switch at page load"); see "Rerun".

## 3. Governor on, free flight at ratio 2

Run 1 (AC): 120 s on the pad at ratio 2, `high`, governor on: **9 522 frames, p50 10.0 ms, p95 20.1 ms, p99 21.0 ms; 25.1 % of the frames over 16.7 ms, 0.1 % over 33.3 ms.** The governor moved between `high` at 100 % and `high` at 70 % five times in the two minutes: the retry stutter of research 01 §4.

Run 2 (battery): p50 30.0 ms, p95 30.8 ms, 100 % over 16.7 ms, and the governor sank to `low` at 55 %. **Not usable:** a flat 30 ms interval is the 30 fps cap of Chrome's Energy Saver mode, which engages near 20 % battery, and the governor, which sees only the interval, reads it as a slow machine. This is a real case for the governor (plan 253): an interval locked at 33 ms is not the GPU's cost.

## Rerun (on AC)

- `data/m5-run3-*`: the ablation with each switch applied at page load, on the 251 code and on the 252 code.
- The 252 table and the governor trace again on AC.

## What plan 252 must beat

| Measure | Before (run 1) | Target |
|---|---|---|
| `high`, ratio 2, sync ms, pad / 3 km / 12 km / orbit | 43.7 / 47.3 / 50.4 / 27.1 | ≤ 16.7 ms each |
| `high`, ratio 2, governor on, p95 interval | 20.1 ms | ≤ 16.7 ms |
| Governor changes in 2 minutes | 5 | ≤ 4 (1 per 30 s) |
