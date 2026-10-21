# 0223 — User alarms in the sim, the node panel and the navigation markers

**Status:** accepted; amended by ADR 0267 (plan 292): the node panel's editor is folded behind a toggle in a compact card
**Date:** 2026-10-19
**Plan:** plans/224-navigation-tools.md
**Builds on:** ADR 0056 (maneuver nodes, warp-to), ADR 0083 (trip planner), ADR 0084 (rendezvous aids), ADR 0201 (the bell), ADR 0202 (flexible time warp, warp-to targets)

## Context

Plan 224 asks for alarms that stop warp also for vessels nobody watches, a typed editor for every node, AN/DN and planned-orbit markers with warp-to, and a minimum transfer-window view. Plan 206 left `warp-to { target: { kind: 'alarm' } }` refused until alarms existed. Open were: where an alarm's time comes from and whether it follows its event, how an alarm and a warp-to share the stop, and whether the save format needs a bump.

## Decision

1. **Alarms live in the sim** (`packages/sim/src/alarms.ts`): `add-alarm` and `remove-alarm`, `Snapshot.alarms` and `SimSave.alarms` (`{ next, list }`). An id is `alarm.<n>`; `add-alarm` with an `id` replaces that alarm (the edit of the alarm list). At most 64.
2. **Kinds and their time:** `time` and `transfer` take `time` from the command (less an optional `lead`); `apoapsis`, `periapsis`, `soi` and `node` take the vessel's next such event (the same function warp-to uses, `eventTime`) less `lead`, or less the warp-to margin (15 s, 30 s for a node) when no lead is given. **The time is fixed when the alarm is set** and is not recomputed when the orbit changes, like the transfer alarm of the plan. The page sets an AN/DN or planned-apsis alarm as a `time` alarm with a name.
3. **Any warp stops at the next alarm.** While the warp is above 1, the step's stop time is the earlier of the warp-to target and the next alarm, so the clock eases into it and, on rails, lands on it exactly. At the alarm the warp goes to 1, `warp:stopped` says `alarm "<name>"`, and `alarm:fired` is posted; the alarm leaves the list. In physics warp the stop comes within one fixed step before the alarm, as for warp-to (plan 206), and the alarm fires at 1×.
4. **Warp-to an alarm** stops at its time (no margin: the alarm already has its lead).
5. **Save:** `SimSave.alarms` is an optional field, not a format bump. An older save simply has none (default per owner review: every section added since format 5 came this way).
6. **The bell:** the web forwards `alarm:fired` as the sim event `alarm`; the world layout's bell and a flight toast show it.
7. **Node panel:** every node is editable. The panel shows the node the map selected (or the first), with ◀ ▶ to step through them, typed prograde, normal and radial (m/s, committed on Enter or blur), time steps of ±1 s, 10 s, 1 min and 10 min, ±orbit (whole periods of the orbit the node lies on; refused for an open orbit or a move into the past) and delete. Typed values, time steps and drag handles all write through `node-set` by the maneuver controller's one draft path.
8. **Markers:** AN/DN are where the vessel's closed orbit crosses the target's plane (when the target shares the vessel's sphere) or the body's equator (the pole is the plane normal). The planned orbit's Ap and Pe are drawn on each stretch after a node that passes them. Each marker has a menu: "Warp here" (current Ap/Pe through the sim's apsis target; the others as a time less the 15 s margin) and "Add alarm".
9. **Next window:** the trip planner gains `nextWindow` (Hohmann phase on circular, coplanar orbits, as the rest of the planner): to a moon of the vessel's sphere from its orbit, or to a neighbour of the sphere (the window from the sphere's own orbit, the burn the ejection from the vessel's orbit). The Mission Center's Upcoming shows date, wait and delta-v and can set a `transfer` alarm.
10. **Delta-v picker:** the flight stage stack can show the stages for another body and situation: TWR against that body's surface gravity, the "sea level" figures at its surface pressure (`stageDeltaV` takes the pressure), or vacuum.

## Consequences

- API_VERSION 0.1.81 (additive): `add-alarm`, `remove-alarm`, `AlarmSnapshot`, `Snapshot.alarms`, `SimSave.alarms`, `alarm:fired`, `CommandResult.alarm`.
- Scripts get no alarm functions yet: the prelude exposes named functions, not commands by name.
- An apsis alarm set before a burn fires at the old apsis time. That is the documented cost of fixed times; re-adding the alarm takes one click.
- Porkchop plots (P2), snap-to-marker and one-click circularise (P1) stay out, as in the plan.
