# 05 — The M5 at 120 Hz: baseline (plan 392, ADR 0330)

The baseline every plan of the 120 Hz wave (393–398) measures against. Numbers are from
`apps/web/scripts/measure-120hz.ts` (`data/m5-120hz-run1.json`); the matrix code is
`apps/web/scripts/lib/frame-matrix.ts`.

## How it was measured

- **Machine:** MacBook Pro, Apple M5, macOS 26.4.1, built-in Retina display 3024 × 1964, **120 Hz** (the rAF period check reads 8.33 ms), plugged in (AC), no thermal or performance warning recorded.
- **Browser:** Chromium of Playwright 1.64.1 (`ms-playwright/chromium-1248`), headed, `--use-angle=metal --enable-unsafe-webgpu`, background throttling off. The owner's Chrome was not used. WebGPU adapter: `vendor apple`, `architecture metal-3`, empty `device` and `description` (Chrome hides the model; see the tier note below).
- **Build:** `NODE_ENV=development bun run build`, served by `scripts/serve.ts`; commit `bf26c221` (branch `rel/392-120hz-baseline`).
- **Scene:** the Hangar's booster rocket on the pad, then the debug API puts it at 3 km and 12 km (150 m/s, level) and in a 100 km circular orbit; each view is warmed 6 s and recorded 20 s. Viewport 1512 × 945 at device scale 2. `high` and `medium`, the governor off and on, WebGPU and WebGL.
- **Load:** the machine was **not quiet**: the system load average was 5 to 6 from other workers' jobs when the run began (the script waits for 3 or less, up to 10 minutes, then goes on). Read the numbers as an upper bound on frame time. A rerun on a quiet machine is part of 393's first step.
- **Caveats of the method:** the 20 s per cell is short (the plan asks 2 minutes for the final baseline); the Xcode Metal capture was **not taken** (no Xcode on this machine); Long Animation Frames only list frames of 50 ms or more, so the main-thread split below is only about the long stalls.

## Frame intervals (the wave target is p95 ≤ 8.4 ms)

| backend | preset | governor | view | p50 ms | p95 ms | > 16.7 ms | > 8.4 ms | fps | canvas | LoAF (≥ 50 ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| webgpu | high | off | pad | 16.7 | 25.1 | 32 % | 91 % | 57 | 3024x1890 | 0 |
| webgpu | high | off | 3km | 16.7 | 25.0 | 27 % | 93 % | 57 | 3024x1890 | 1 |
| webgpu | high | off | 12km | 16.7 | 23.4 | 19 % | 92 % | 62 | 3024x1890 | 0 |
| webgpu | high | off | orbit | 16.7 | 24.3 | 20 % | 91 % | 62 | 3024x1890 | 0 |
| webgpu | high | on | pad | 16.6 | 18.6 | 15 % | 82 % | 66 | 2268x1417 | 0 |
| webgpu | high | on | 3km | 16.6 | 23.9 | 19 % | 87 % | 63 | 1927x1204 | 2 |
| webgpu | high | on | 12km | 16.6 | 18.0 | 11 % | 80 % | 69 | 1927x1204 | 0 |
| webgpu | high | on | orbit | 16.5 | 17.8 | 10 % | 77 % | 71 | 1927x1204 | 0 |
| webgpu | medium | off | pad | 15.5 | 18.0 | 10 % | 71 % | 75 | 2268x1417 | 0 |
| webgpu | medium | off | 3km | 15.8 | 18.1 | 11 % | 67 % | 75 | 2268x1417 | 0 |
| webgpu | medium | off | 12km | 14.6 | 17.1 | 7 % | 62 % | 80 | 2268x1417 | 0 |
| webgpu | medium | off | orbit | 9.6 | 16.9 | 4 % | 55 % | 85 | 2268x1417 | 0 |
| webgpu | medium | on | pad | 15.4 | 17.7 | 9 % | 64 % | 77 | 2268x1417 | 0 |
| webgpu | medium | on | 3km | 15.7 | 18.2 | 11 % | 67 % | 75 | 1927x1204 | 0 |
| webgpu | medium | on | 12km | 10.2 | 17.4 | 8 % | 60 % | 82 | 1927x1204 | 0 |
| webgpu | medium | on | orbit | 9.8 | 16.9 | 5 % | 57 % | 84 | 1927x1204 | 0 |
| webgl | high | off | pad | 50.0 | 55.5 | 100 % | 100 % | 20 | 3024x1890 | 89 |
| webgl | high | off | 3km | 50.1 | 158.8 | 75 % | 83 % | 19 | 3024x1890 | 221 |
| webgl | high | off | 12km | 50.4 | 58.7 | 100 % | 100 % | 19 | 3024x1890 | 377 |
| webgl | high | off | orbit | 50.0 | 58.3 | 100 % | 100 % | 20 | 3024x1890 | 284 |
| webgl | high | on | pad | 41.6 | 43.4 | 96 % | 97 % | 25 | 1927x1204 | 2 |
| webgl | high | on | 3km | 8.3 | 40.2 | 7 % | 34 % | 96 | 1285x803 | 1 |
| webgl | high | on | 12km | 8.3 | 10.1 | 0 % | 30 % | 120 | 1285x803 | 0 |
| webgl | high | on | orbit | 8.3 | 10.2 | 0 % | 30 % | 120 | 1285x803 | 0 |
| webgl | medium | off | pad | 16.6 | 18.4 | 21 % | 89 % | 64 | 2268x1417 | 0 |
| webgl | medium | off | 3km | 16.6 | 18.3 | 21 % | 87 % | 66 | 2268x1417 | 0 |
| webgl | medium | off | 12km | 16.6 | 18.2 | 21 % | 88 % | 66 | 2268x1417 | 0 |
| webgl | medium | off | orbit | 16.6 | 18.2 | 20 % | 85 % | 67 | 2268x1417 | 0 |
| webgl | medium | on | pad | 16.6 | 18.5 | 22 % | 90 % | 64 | 1927x1204 | 0 |
| webgl | medium | on | 3km | 16.6 | 18.3 | 22 % | 91 % | 64 | 1927x1204 | 0 |
| webgl | medium | on | 12km | 16.6 | 18.2 | 20 % | 81 % | 68 | 1927x1204 | 0 |
| webgl | medium | on | orbit | 16.5 | 18.2 | 20 % | 83 % | 68 | 1927x1204 | 0 |

**Reading it.**

- **No cell reaches p95 ≤ 8.4 ms on WebGPU.** At `high` it is 23 to 25 ms with the governor off (the canvas is 3024 × 1890) and 18 to 24 ms with it on (the governor drops to `medium` and 1927 × 1204 within seconds). At `medium` it is 17 to 18 ms: close to a locked 60 but not a locked 120, with 55 to 71 % of frames over 8.4 ms.
- **WebGL `high` is unplayable with the governor off** (20 fps, p95 55 to 159 ms), and with it on the governor drops the canvas to 1285 × 803 and **WebGL then holds 120 fps at 12 km and in orbit (p95 10 ms)**: at that size the frame is cheap. This is the only cell with a p50 of 8.3 ms. The cost of WebGL at full Retina is in the pixels, not in the frame structure.
- **`medium` on both backends sits at p50 about 16 ms, p95 17 to 18 ms**: the frame work is between 8.4 and 16.7 ms and presentation falls to the 60 Hz slot. 120 needs the frame work under 8.3 ms, with a margin.
- The governor changes the canvas size (the column "canvas" is what it settled on), so its rows are not the same work as the governor-off rows.

## GPU time and passes

- **Render contexts per frame (WebGPU, exact):** 18 at every view: **3 for the planet** and **15 for the scene** (the scene pass, the bloom chain's mips and the output pass are inside the scene's 15). This is the count of passes a tile GPU resolves per frame; plan 394 starts from it.
- **Pass milliseconds do not add up on Apple GPUs.** The timestamp pool reports, for each context, a span of 7 to 14 ms (planet contexts 8 to 14 ms; every scene context 7 to 9 ms, in a run of near-identical values), which summed over 18 contexts is 130 ms for a frame that takes 17. Dawn's timestamps on Metal bracket a pass's start and end in the queue and the passes overlap, so each span includes the others'. **Use the pass numbers only to order the passes** (the planet's first contexts are the longest at 12 to 14 ms), not to say where the 8.3 ms go. An Xcode Metal capture is the way to get real per-pass costs (open item).
- **`gpuFrameMs` under-reads.** The live meter divides the pool's last-frame total by the number of frames since the last read (30), but in three r186 the pool returns the last frame's total only, so the value shown (3 to 7 ms in the table of the run) is the last frame's inflated total divided by 30. The governor reads it as evidence of headroom (ADR 0233); plan 395 must not trust it as it is. Not changed here.

## Main thread

- Long Animation Frames (≥ 50 ms) in the 20 s cells: none on WebGPU except two at 3 km on the governor-on run (up to 102 ms, the governor's preset change); on WebGL `high` with the governor on there are two long frames at the pad (2.3 s and 1.6 s blocking: the preset change rebuilding shaders), and on WebGL `high` with it off 89 to 377 long frames per cell (the frames are 50 ms because the GPU is behind, not script). Nothing in the `medium` runs. The 8 ms slot's split (sim apply, HUD, encode, GC) needs a finer profile than LoAF gives (a Chrome trace) and is open.

## First load (cold shader state in this run is warm: the build was served once before)

| backend | preset | governor | load to playable | pipelines | summed compile time |
|---|---|---|---|---|---|
| webgpu | high | off | 4.6 s | 58 | 17.3 s |
| webgpu | high | on | 3.5 s | 58 | 5.6 s |
| webgpu | medium | off | 3.6 s | 65 | 7.6 s |
| webgpu | medium | on | 3.0 s | 65 | 6.6 s |
| webgl | high | off | 14.5 s | 179 | 601.6 s |
| webgl | high | on | 6.0 s | 167 | 129.0 s |
| webgl | medium | off | 5.9 s | 167 | 144.1 s |
| webgl | medium | on | 3.6 s | 167 | 76.0 s |

The Chromium profile was fresh for every run of the script, so the disk shader cache was empty at the first row. WebGPU loads in 3 to 5 s on this machine; WebGL `high` first load is 14.5 s with 179 programs (summed compile time 601 s because compiles overlap and are counted as they finish).

## Device tiers (what 395 locks to)

`packages/renderer/src/device-tier.ts` decides from the GPU string and the display's rate:

| Tier | Machines | Lock | Starts at |
|---|---|---|---|
| `m5` | Apple M3 and later, M1/M2 Pro, Max, Ultra (when the model is known) | 120 | `high` |
| `apple` | Apple silicon whose model Chrome hides (this machine: `apple`, `metal-3`) | 120 on a 120 Hz display, else 60 | `medium` |
| `m2` | base M1, M2 by name | 60 | `low` |
| `discrete-high` | RTX 3060 and up, RX 6600 and up | 120 on a 120 Hz or faster display, else 60 | `high` |
| `discrete-mid` | GTX 1650, RTX 3050 class | 60 | `medium` |
| `integrated` | Intel Iris Xe, Arc, Radeon 680M and later | 60 | `low` |
| `low` | older integrated, software, phones | 30 | `low` |

**Chrome does not say which Apple chip it is** (the adapter's `description` is empty), so an M2 Air and an M5 both read `apple`; the display's rate separates them where it can (a 60 Hz M2 Air locks at 60, a 120 Hz Pro at 120) and the governor does the rest. The M2 target of a locked 60 therefore comes from the display, not from the chip name.

## The M2 and Windows tiers (open, [manual])

Run `bun scripts/measure-tier.ts` on the machine (header of the script: one command, writes `tier-report-<tier>.json`, prints a table, records the cold first-load compile times per pipeline). Not run: this plan has no M2 or Windows machine. Sections to add when the reports come back:

- base M2 (Worker D's), p95 at the pad, 3 km, 12 km and orbit at the selected preset against 16.7 ms;
- one integrated GPU and one GTX 1650 / RTX 3050 class card, Chrome or Edge, WebGPU on D3D12 and WebGL on ANGLE D3D11, against 16.7 ms, with the cold compile times (plans 370 and 374).

## What this says for the rest of the wave

1. The frame work on WebGPU at `medium` is 8.4 to 16.7 ms, at `high` more than 16.7 ms on this scene at Retina: 393 (TAAU: render fewer pixels, upscale) and 394 (fewer passes: 18 contexts) both attack this; the WebGL run shows that at 1285 × 803 the whole frame fits 8.3 ms.
2. The planet is the longest context group (3 contexts, 8 to 14 ms each in the inflated spans) and the first thing a real capture should open.
3. 395 needs a trustworthy GPU time first: either fix `gpuFrameMs` (divide by one, and understand the inflation) or use frame intervals only.
4. Open items of 392: the Xcode Metal capture of a `high` pad frame (frame-end costs, load and store actions, bandwidth), a quiet-machine rerun with 2-minute cells, and the M2 and Windows sections.
