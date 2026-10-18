# 205 — Clock states, pause rules, tab policy, leaving active flight

**Plan:** [plans/205-clock-states-and-pause-rules.md](../plans/205-clock-states-and-pause-rules.md) · **Session:** Worker B, 2026-10-19 · **ADRs:** [0201](../decisions/0201-one-sim-per-world-base-layout-clock-states-pause.md) · **Research:** none

## What was done

| Where | What |
|---|---|
| `packages/core`, `packages/sim` | command `pause { on }`, `SimCore.paused`, `Sim.paused`, `Snapshot.paused`; event `warp:stopped { reason }` (SOI change, warp-to arrival, a vessel in flight) |
| `mods/stock/src/rules.ts` | rule `stock.pause-allowed` (true except Career Hardcore; category `world`) |
| `apps/web/src/lib/clock-state.ts` | the pure state machine and the place defaults |
| sim host and client | the `pause` message goes through the sim's command (outside the replay recorder); a `catch-up` message for a hidden tab that kept running; `warp-stopped` and `building-ready` sim events (and `part-failed`, which the message parser had dropped as malformed) |
| world layout | player pause (P, Space outside Flight and the Hangar, the time bar's button), place pause, menu holds, hidden-tab policy, the chip, the place toggle, the bell entries, `window.__orbitalDebug` |
| Settings | Time tab: per-place pauses, keep running in a hidden tab, ask before leaving a flight |
| Flight | the leave-flight dialog; its dialogs hold a "Menu" pause instead of pausing the sim |
| e2e | `clock.e2e.ts`, `leave-flight.e2e.ts` |

## What surprised me

- **The worker's `part-failed` sim event never reached the page:** the message parser's list of event types did not have it, so a failure would have shown as "malformed message from the worker". Fixed in passing.
- **Space places a part in the Hangar**, so it pauses only on the other non-flight pages; P works everywhere.
- **A keybindings test rebound `sasPrograde` to `P`**, which is now the global pause key; the test takes `F7`.

## Decisions made (link ADRs)

- ADR 0201 points 4 to 10 as written. Details: the sim owns the pause so the rule is checked where it lives; a refused pause goes to the bell; a pause is not saved.

## Open questions / follow-ups

- The rule's mid-game edit (only toward easier, with a log entry) is plan 230's editor.
- Bell sources that do not exist yet (alarms, contract deadlines, EC out, life support critical, transfer windows) come with their plans.

## Verification output

```
bun test packages/sim/test/pause-rule.test.ts   3 pass
vitest clock-state 6; settings 10; keybindings 20; web vitest 148 files, 1097 pass
playwright chromium: clock, leave-flight, debug (3), world-shell, recovery, smoke (7), launch (2): 16 passed
check:affected --build --e2e e2e/clock.e2e.ts: all passed in 272.8 s
CI ready/205: refs/ci/pass/23b81516
```
