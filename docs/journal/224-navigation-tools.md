# 224 — Navigation tools: numeric node editor, AN/DN, alarms, transfer windows

**Plan:** [plans/224-navigation-tools.md](../plans/224-navigation-tools.md) · **Session:** Worker C, 2026-10-19 · **ADRs:** [0223](../decisions/0223-user-alarms-and-navigation-tools.md), [0202](../decisions/0202-flexible-time-warp.md), [0056](../decisions/0056-maneuver-nodes.md)

## What was done

| Where | What |
|---|---|
| `packages/core` | `add-alarm` / `remove-alarm`, `AlarmSnapshot`, `Snapshot.alarms`, `SimSave.alarms` (optional), `alarm:fired`, `CommandResult.alarm`; API 0.1.81 |
| `packages/sim` | `alarms.ts`; `eventTime` shared by warp-to and alarms; the step stops at the earlier of the warp-to target and the next alarm (`stopAt`); warp-to an alarm |
| web, flight | node panel for every node (◀ ▶, typed prograde/normal/radial, ±1 s…±10 min, ±orbit, alarm, remove, planned Ap/Pe); AN/DN markers (target plane or equator) and planned Ap/Pe markers with a Warp here / Add alarm menu; delta-v body and situation picker in the stage stack (`stageDeltaV` takes a pressure) |
| web, Mission Center | alarms in Upcoming with edit and delete, an alarm form (durations like `10 min`, `1h 30m`, `1:30:00`), the next transfer window (date, wait, delta-v) with "Alarm at window" |
| web, bell | sim event `alarm` → bell entry and flight toast |
| tests | `packages/sim/test/alarms.test.ts` (3), `nav-markers.test.ts` (3), `maneuver.test.ts` (+3), `mission-center/model.test.ts` (+2), `editor/trip.test.ts` (+2), `e2e/navigation.e2e.ts` |

## What surprised me

- **Warp-to already had the hook:** plan 206 put `{ kind: 'alarm', id }` in `WarpTarget` and refused it. Only the time lookup changed.
- **An alarm and a warp-to share one stop.** Setting `warpTarget` to the alarm time would have overwritten the player's warp-to; the step now takes the earlier of the two, and the arrival code tells which one it reached.
- **Physics warp cannot land on a time:** like warp-to, an alarm at 2–10× ends the warp within one fixed step before the time, and the alarm fires at 1× a moment later.
- **The equator plane of a body is its pole,** not world +Z: bodies spin about +Y here. `relativeNodes` from the rendezvous aids gives AN/DN against any plane once the reference is a synthetic circular state in that plane.
- **`grep` in this shell is `rg` through RTK:** `\|` alternation fails; plain patterns or `rtk proxy grep` work.

## Decisions made (link ADRs)

- ADR 0223. In the plan's Log: no save format bump (optional field), event alarms are fixed when set, a fired alarm leaves the list.

## Open questions / follow-ups

- Scripts have no alarm functions yet (the prelude has no commands by name).
- An apsis alarm does not follow a later burn; a "follow the event" option could come with snap-to-marker (P1).
