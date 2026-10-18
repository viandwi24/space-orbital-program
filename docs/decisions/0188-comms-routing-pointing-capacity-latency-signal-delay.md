# 0188 — Comms tier 3: relays and the routing graph, dish pointing, route modes, shared capacity, latency and the signal-delay rule

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 117
**Builds on:** ADR 0101 tier 3 and point 4 (`signalDelay`: display, enforced, flight-computer), 0179 (tier 1: the link rule, control points, probe control), 0185 (tier 2: the budget and rates), 0109 (command source), 0031 and 0039 (scripts and warp), 0122 (save migrations).

## Context

Tiers 1 and 2 link each vessel directly to one control point. Tier 3 adds:

- relays, and routes through them;
- dishes that point at something;
- Auto, Manual and Policy routing;
- capacity shared by the vessels on one link;
- latency;
- the signal-delay rule.

Open questions:

- what a node and an edge are;
- which path Auto takes;
- how a pinned route breaks;
- what a policy is;
- how capacity is shared;
- which commands wait, and for how long;
- how a script's commands are told apart from the player's;
- what is saved.

## Decision

1. **The graph.**
   - **Nodes:** every station, and every vessel with an enabled, working antenna. Any such vessel relays; tier 1 linked only to control points.
   - **Edges:** a pair is an edge when it passes the tier-1 checks between the two (range, line of sight, terrain, the vessel's blackout). Its capacity is the tier-2 budget's rate from the farther-out end, or 0 ("commands only") without a budget.
   - **Control points:** stations, and vessels with a crewed command part (as in tier 1).
   - **Linked:** a vessel is linked when a path reaches a control point.
   - **Recomputing:** the graph is rebuilt at each network update, at its last sample. Bisection still dates link changes on the direct tier-1 rule, and tier-1 events keep their meaning.
2. **Dish pointing.** A dish antenna has a beam width:
   - `beamWidth` (rad) on the definition, or `70 λ / D` degrees from its band and aperture, or 2° without either.
   - The antenna module's state holds `target`: `null` (Auto, which points at whatever it links to) or an id (a station, `vessel:<id>`, or a body id).
   - A dish pointed at a target forms edges only with nodes within half its beam of the target's direction. Omni antennas and stations see all around.
   - The command `antenna-point { vessel, part, target }` sets it (never refused for lack of signal, as antenna toggles are).
3. **Route modes per vessel.** The command `comms-route { vessel, mode }`, where the mode is one of these:
   - **`{ kind: 'auto' }`** (the default): the widest path, the largest minimum edge capacity. Ties go to fewer hops, then the shorter total distance, then the ids.
   - **`{ kind: 'manual', via: [ids] }`:** the hops are pinned, ending at a control point. The route is used as long as every pinned edge exists, even when a direct link exists. When one breaks, the vessel is unlinked with the reason `route broken at <id>`.
   - **`{ kind: 'policy', policy }`:** a registered `defineRoutePolicy({ id, label, choose(routes) })` picks from the candidate routes. These are the best route through each first hop, each with `{ hops, width, latency }`. `choose` is pure and returns an index. Stock registers `stock.fewest-hops` and `stock.lowest-latency`.
4. **Shared capacity** by bounded proportional rounds:
   - each routed vessel asks for its path width;
   - in each of 3 rounds, every edge whose flows ask more than its capacity scales them down in proportion;
   - a vessel's rate is the smallest share it got on its path.

   This is deterministic, O(rounds × edges × flows), and close to max-min fairness for the few relays a game has.
5. **Latency** is the route's total length divided by the speed of light. `Snapshot.network.vessels` gains `route` (the hop ids) and `latency` (s). `ctx.vessel.signal()` gains `latency`.
6. **The signal-delay rule** (`stock.signal-delay`, ADR 0101 point 4) acts on probes only. Crew aboard command at once.
   - **`display`** (default): commands apply at once; the HUD shows the latency.
   - **`enforced`:** the vessel control commands (`throttle`, `attitude`, `sas`, `stage`, `action`, `action-group`) for a linked probe are queued and apply when the sim time reaches `now + latency`.
     - Queue entries are `{ at, seq, command }`, applied in that order at the first step boundary at or after `at`. A queued command is re-checked when it applies.
     - Planning commands (nodes, targets, warp) never wait. An unlinked probe is refused as in tier 1.
   - **`flight-computer`:** as `enforced`, except that commands dispatched with `{ source: 'script' }` apply at once (the script runs on board). The player's commands still wait.
   - `Sim.dispatch(command, { source })` takes the source (default `player`). The web host passes `script` for the script runner's commands. A delayed dispatch returns `{ ok: true, queued: at }`.
7. **Save format 7.** `SimSave.comms = { routes: [{ vessel, mode }], queue: [{ at, seq, command }], seq }`. Dish targets are module state, already saved. The migration from 6 adds an empty `comms`. The frozen fixture `save-v6.json` proves it.

## Alternatives considered

- **Shortest path (Dijkstra by distance) as Auto:** rejected. The widest path is what a data network wants, and ties go to the shorter path anyway.
- **Exact max-min fairness (water-filling):** rejected for now. Three proportional rounds are cheap and stable, and planning tools (118) can show the real numbers.
- **Delaying script commands always:** rejected. That is what `enforced` means; `flight-computer` exists to run them on board.
- **Pointing as a part action with options:** rejected. The list of targets changes with the world, and a command with an id is simpler to validate.

## Consequences

- **Mod API:**
  - `defineRoutePolicy` and `ctx.routePolicies`, report kind `route-policy`;
  - `AntennaDefinition.beamWidth`;
  - the antenna hook's `target`;
  - `SignalState.latency`.

  All additive, with an `API_VERSION` patch bump.
- **Protocol:**
  - the commands `comms-route` and `antenna-point`;
  - `dispatch`'s `source` option;
  - `CommandResult.queued`;
  - `route` and `latency` on network vessels.
- **Save:** format 7 with a migration.
- **Follow-ups:**
  - planning tools (118): contact timeline and coverage;
  - data queues (119);
  - the EC draw of transmitters.
