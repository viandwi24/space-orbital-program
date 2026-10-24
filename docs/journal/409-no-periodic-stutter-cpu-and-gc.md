# 409 — No periodic stutter, page side: no strings to tell what changed, no per-frame copies

**Plan:** [plans/409-no-periodic-stutter-cpu-and-gc.md](../plans/409-no-periodic-stutter-cpu-and-gc.md) · **Session:** Worker C, 2026-10-24 · **ADRs:** 0358 (the snapshot deltas are plan 365's, left as they are)

## Every per-snapshot and per-frame allocation found

| Where | Per | What it did | Now |
|---|---|---|---|
| Space Center page, `onSnapshot` | snapshot (62.5 Hz) | `JSON.stringify` of the economy and of the site, twice each, to tell if they changed | `deepEqual` (reference first: the delta decoder keeps unchanged objects identical) |
| Space Center page, `drawSites` | snapshot | built every home site's draws, then `JSON.stringify([draws, view])` | skipped when its inputs (sites, day, the site list, home, the selected site) are the same objects; a rebuilt layout equal to the drawn one is not sent again |
| Space Center page, `onFrame` | frame (180 Hz) | `pinPositions` built two records, then two `JSON.stringify` of the labels | `pinPositionsOrPrev`: the previous record itself while no pin moves a pixel |
| Mission Center page | snapshot | `JSON.stringify` of the labels and the network, both sides | `deepEqual` |
| Flight page, `frame` | frame | `JSON.stringify` of the network, the body labels and the ghost | `deepEqual` against the last value handed on |
| Flight page, shell clock and place | HUD update | a stringified object parsed again in an effect | separate primitive `$derived`s, no strings |
| `flight-loop.ts`, `showSite` | snapshot | `JSON.stringify` of every site's buildings and roads | `siteLayoutSame` (reference first, then `deepEqual`) |
| `hud-model.ts` `fingerprint` | HUD update | `JSON.stringify` of the whole design to hash a callsign | cached on the design's parts and stages objects |
| Quality governor, `tick` | frame | `window()` sliced about 1 500 samples twice and `filter`ed them; `trim()` sliced them again; `estimateCadence` copied and sorted its window | `scan()` (no copy, a reused result), the arrays cut in chunks of 128, the cadence quantile every 6th frame; the copying `window()` only on the rare branches that need the samples |
| `environment.ts` | frame | `new Matrix4()` for the shadow matrix; the env key built with `join` | a reused matrix; the key string rebuilt only when its parts change |

Left as they are, with the reason: `dock/mod-frame.ts` `frameInput` (a JSON round trip to hand a mod panel plain data, only while a mod panel is open); the snapshot encoder's `JSON.stringify` per key (in the worker, plan 365's measured cost); `catalogKey` (once per world); the autosave and thumbnail (suspect 6 of the investigation, plan 408's).

## Tests

- `quality-governor.test.ts`: a minute of steady 180 Hz frames makes under 0.1 array copies a frame (it made about 4 with the old windows: the test fails on the old code).
- `hot-paths.test.ts`: the Space Center, Mission Center and the flight loop contain no `JSON.stringify`; the flight page only in the replay download; `pinPositionsOrPrev` returns `prev` itself while steady.
- `deep-equal.test.ts`.

## Measured

Vite dev server in the built-in browser, the Legacy world's Space Center, `usedJSHeapSize` once a second for 65 s after a fresh load: before 262 to 268 MB, after 264 to 270 MB. That world has one site and few buildings, so it did not show the owner's 150 MB sawtooth either before or after; the churn the owner sees comes from a large world and from the governor's copies at 180 Hz, which no scene here reproduces (the allocation counts above and the copy-count test stand for it). The flight scene and a 2-minute run on the owner's machine are the check still to make (`/tmp/orbital-measuring`).
