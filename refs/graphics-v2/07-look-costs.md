# 07 — What each look costs, on and off (plans 403, 410, 413, 414)

Measured by Worker B on the owner's M5 MacBook Pro (WebGPU, High, the governor off, a development build, 1512 x 945 at a device pixel ratio of 2, the display at 120 Hz, on AC), 2026-10-24, with `apps/web/scripts/measure-looks.ts` under `/tmp/orbital-measuring`. Each cell is 10 s after 5 s of warm-up, two alternating rounds of on and off, a fresh page for each look. The load average was 3 to 4 (other sessions), not 3 or less in every run. `renderer.debug.setLookOff(look, off)` switches a look.

Read the **mean** frame interval, not the GPU column: Apple's GPU timestamps under-read (journal 392; they read 5 ms while the frames took 20), and the p95 of a frame interval moves in steps of the 60 Hz refresh (16.7, 33.4 ms) that hide a 1 or 2 ms change.

## The pad (the launch site, the vessel on the pad)

Run after plan 412's fix (the pipelines no longer fail at a pixel ratio of 2) and before plan 413's tuft thinning.

| look switched off | mean ms on | mean ms off | share of frames over 16.7 ms, on | off |
|---|---|---|---|---|
| **site** (everything of the launch site) | 20.9 | **16.7** | 25 % | 0 % |
| **vegetation** (trees and tufts) | 19.6 | **16.8** | 17 % | 1 % |
| tufts alone | 21.0 | 18.4 | 26 % | 11 % |
| trees alone | 20.7 | 19.6 | 24 % | 18 % |
| vessels | 21.0 | 20.9 | 25 % | 25 % |
| shadows (the sun's shadow map) | 21.9 | 21.6 | 31 % | 30 % |
| terrain | 22.5 | 22.9 | 34 % | 37 % |
| clouds | 22.5 | 22.3 | 35 % | 34 % |
| far cloud shell | 20.6 | 20.5 | 23 % | 23 % |
| bakes of other bodies | 21.0 | 20.6 | 26 % | 24 % |
| ground rocks | 20.8 | 20.9 | 24 % | 25 % |
| ocean | 21.1 | 20.8 | 27 % | 25 % |

**What the pad pays for:** the launch site, and in it the vegetation: 28 000 grass tufts cost about 2.6 ms of every frame and 2 000 trees about 1.1 ms. With the site off the pad draws at the 60 Hz floor (16.7 ms), so nothing else on the pad costs a frame. None of plans 397 to 406's looks (clouds, ocean, terrain march, shadows, the far shell, the bakes, the rocks, a mod planet's images) measured above noise at the pad.

Before plan 412 the same cells read 33 to 66 ms and degraded with each toggle (a leak in the first version of the rocks switch), and a failed `planet-edge` pipeline at a pixel ratio of 2 sat in the console; those runs are not kept.

## After plan 413 (the lawn thinned by distance)

| look switched off | mean ms on | mean ms off | over 16.7 ms, on | off |
|---|---|---|---|---|
| site | 18.4 | 16.7 | 10 % | 0 % |
| vegetation | 18.2 | 16.7 | 9 % | 0 % |
| tufts alone | 17.8 | 16.9 | 6 % | 1 % |

Mean frame at the pad 20.9 to about 18.2 ms; frames over 16.7 ms from 25 % to 9 %; the tufts' share of the frame from 2.6 to 0.9 ms. The trees (about 0.6 ms now) and the rest of the site (0.2 ms) remain.

## Other scenes (first run, per-scene pages; read with care)

p95 at the 60 Hz floor (16.7 ms) means the look has no measurable cost there. The first full run had the rocks leak, which the scenes after it may carry; where on and off agree to a frame they are fine.

| scene | looks that moved the mean (on / off) |
|---|---|
| orbit | none (16.7 / 16.7 for every look) |
| Space Center | ocean: 16.8 / 25.1 ms p95 (the sea is drawn there), the rest 16.8 |
| Cinder from 300 km | all 33.3 ms p95 on and off; the bake is not a cost (33.3 / 33.3) |
| the sample mod planet from 900 km | ocean 25.0 / 33.3, clouds and terrain 33.4 / 33.4, the rest 16.7 |

The orbit's p95 of 16.7 ms is a 60 Hz pace although the display runs at 120: a frame there costs under 16.7 ms and over 8.3.

## How to repeat

```bash
NODE_ENV=development bun run build   # in apps/web
SERVE_ROOT=$PWD/build bun scripts/serve.ts 5211 &
echo "<your name> <what>" > /tmp/orbital-measuring       # only if it does not exist; remove it only if it still has your name
SCENES=pad,12km,orbit,space-center LOOKS=vegetation,site,tufts,trees SHOT_URL=http://localhost:5211 bun scripts/measure-looks.ts out.json
```

Looks: `bakes farShell rocks images ocean clouds terrain vegetation shadows site vessels trees tufts`.


## Correction: headed numbers (plan 414)

`measure-looks.ts` launched Chromium **headless**, which is paced at 60 Hz whatever the display does, so every cell above has a floor of 16.7 ms (orbit read 16.7; headed it reads 8.3). The tables above are from that run: their ordering holds, their absolute numbers do not. The script is headed now (`MEASURE_HEADLESS=1` for the old behaviour). The same cells, **headed** (WebGPU High, 10 s, two rounds, mean frame interval, on / off), after the lawn thinning and the tree, bush and tuft levels of detail (ADR 0372):

| scene | look off | mean on | mean off | frames over 16.7 ms, on / off |
|---|---|---|---|---|
| pad | **site** (the whole launch site) | 18.2 | **11.9** | 32 % / 6 % |
| pad | floods (4 idle point lights) | 19.2 | 17.7 | 42 % / 29 % |
| pad | vegetation | 19.4 | 18.6 | 44 % / 37 % |
| pad | trees | 19.4 | 18.7 | 45 % / 39 % |
| pad | tufts | 20.7 | 19.9 | 58 % / 54 % |
| pad | people | 19.5 | 19.1 | 46 % / 44 % |
| pad | structures (buildings, tower, masts: 190 k triangles) | 18.0 | 17.8 | 30 % / 27 % |
| pad | steam, vessels, shadows, terrain, clouds | within 0.3 ms of on | | |
| orbit | every look | 8.3 | 8.3 | 0 % |

(Rows come from runs of different build moments and the machine's load of 2 to 4; read differences under 0.5 ms as noise.)

- The M5 holds 120 Hz in orbit with every look on (8.3 ms).
- At the pad the frame is 18 to 20 ms. Without the launch site it is 11.9 to 12.3; the site is 6 to 7 ms.
- The parts of the site add up to about 3 ms (the four floodlights, idle by day, 1.5; vegetation 0.8; people 0.4; the structures 0.2); about 3.5 ms of the site's cost is not accounted for by any part tried.
- Without the site the pad is still 3.6 ms over the orbit's 8.3: the vessel, the ground and the planet pass near the ground.

### The site's parts one at a time (plan 414, headed, mean frame ms on / off, 20 s settle)

| look off | pad |
|---|---|
| **site** (everything) | 21.8 / **15.8** |
| bushes | 21.1 / 21.1 |
| rocks of the site | 20.8 / 20.5 |
| trees | 20.9 / 20.7 |
| tufts | 21.4 / 21.1 |
| structures (190 k triangles, in a render bundle) | 21.5 / 21.5 |
| floodlights (4 point lights, idle by day) | 1.5 ms (an earlier run) |

No part of the site, drawn alone, is worth more than 0.3 ms; the whole site is 6 ms. The cost is in the site as a whole, not in a mesh of it: the lit materials' light loop over the site's seven point lights (the four floods and three others) is the one candidate, and removing the floods at dusk-safe cost is not done (their variants were not built by the warm-up: see the journal). Plan 415 breaks the pad down further.

### The lights (plan 414, ADR 0373)

The scene held 11 point and spot lights by day; each is in every lit material's loop. After: the site holds none (its floodlights are drawn glow) and the pools are 2 lamps and 2 plume cluster lights. Interleaved A/B on the M5, headed, the pad: mean 19.7 to 16.8 ms, frames over 16.7 ms 62 % to 44 %; dusk builds 0 pipelines.
