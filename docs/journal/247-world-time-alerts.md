# 247 — World time and alerts

**Plan:** [plans/247-world-time-alerts.md](../plans/247-world-time-alerts.md) · **Session:** Worker C, 2026-10-20 · **ADRs:** none (every choice below follows ADR 0202 and 0223)

## What was done

| Where | What |
|---|---|
| `sim/warp-stop.ts` | `stopWarp(core, reason)`: to 1×, drops the time still to play at the old rate, posts `warp:stopped` |
| `sim/buildings.ts`, `power.ts`, `life.ts`, `objectives.ts` | construction done on the tick, a player vessel out of power, a crew short of a resource, and a passed contract deadline each stop the warp |
| `sim/warp.ts` | falling into the atmosphere at rails warp now stops at 1× (it was 10×) |
| `sim/sim.ts`, `constants.ts` | physics warp in every world halves when one frame's flight work (steps × parts in flight) passes `FLIGHT_FRAME_PART_STEPS` (3000); `warp:limited` says so |
| `sim/alarms.ts` | apsis alarms keep a `lead` and follow the next apsis while the vessel flies, so a burn moves them |
| scripting | `setAlarm({name, time})` / `setAlarm({name, kind, lead})`, `removeAlarm(id)`, `ship.alarms`; guide updated |
| web | `vessel:frozen` forwarded as `vessel-frozen`; the bell warns that a vessel was frozen by warp; every stop already reaches the bell as "Warp stopped: …" |
| tests | `sim/test/warp-stops.test.ts`, one script test in `scripting/test/maneuver.test.ts`, `e2e/world-time-alerts.e2e.ts` (atmosphere entry; not run locally, batch mode) |

## What surprised me

- **The bell already had the stops:** `warp-stopped` was forwarded with its reason; the sim just never stopped for these events.
- **The frame budget is a count, not a clock:** a wall-clock drop would break replays (plan 131), so it is steps × parts, like the n-body evaluation count.

## Open questions / follow-ups

- `FLIGHT_FRAME_PART_STEPS` is an estimate (about 8 ms on the M5); tune it with the plan-251 baseline.
- The e2e for "construction done stops 1000×" needs warp on the Space Center page (plan 248); the sim test covers it until then.
