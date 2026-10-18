# 117 — Comms tier 3: pointing, routing, latency and the signal-delay rule

**Plan:** plans/117-comms-tier-3-routing-latency-delay.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode · **ADRs:** [0188](../decisions/0188-comms-routing-pointing-capacity-latency-signal-delay.md) (new), [0101](../decisions/0101-communications-one-model-six-tiers-delay-off-by-default.md), [0179](../decisions/0179-comms-tier-1-links-stations-control-blackout.md), [0185](../decisions/0185-comms-link-budget-bands-rate-ladder-inspector.md) · **Research:** none new (the dish beam width `70 λ / D` degrees is the textbook half-power rule, next to the dish gain in `docs/research/comms.md`)

**Status when written: criteria met here, handed over as `ready/117`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/comms.ts` | `beamWidth`, `beamWidthOf`; `RouteMode` and its schema; `RouteCandidate`, `RoutePolicyDefinition` and its schema; `DELAYED_COMMANDS`, `CAPACITY_ROUNDS`; `COMMS_RULES.signalDelay`; the reason `route broken at <id>`; `SignalState.latency` |
| `packages/core` | the `routePolicies` registry, `ctx.routePolicies`, report kind `route-policy`; the antenna hook's `target`; the commands `comms-route` and `antenna-point`; `CommandResult.queued`; `route`, `latency` and `mode` on network vessels; save format 7 with `SimSave.comms` and the 6 → 7 migration; `API_VERSION 0.1.67 (0.1.66 went to 063 at its merge) (101 holds 0.1.65) |
| `packages/sim/src/comms.ts` | `routeNetwork`: vertices, edges (a cheap reject first, then pointing, line of sight and terrain), capacities from reference margins, a multi-source widest-path tree, Auto, Manual and Policy routes, three rounds of capacity sharing, latency. Updates and snapshots use it, and the tier-1 `linkOf` stays for bisection and reasons. `modeOf`, `setRouteMode`, `isProbe` |
| `packages/sim/src/delay.ts` (new) | `delayOf`, `enqueue`, `drainQueue`, `nextArrival` |
| `packages/sim` | `dispatch(core, command, source)` queues delayed commands; `Sim.dispatch(command, { source })`; the queue drains at the start of each flight step and rails chunk; `antenna-point` and `comms-route`; `SimCore.commsState`, initialized and saved |
| `mods/stock` | the antenna module's `target`; the route policies `stock.fewest-hops` and `stock.lowest-latency` |
| `packages/sdk` | `defineRoutePolicy`; the route types |
| `apps/web` | the link badge shows the light time from 0.1 s. The Comms tab shows the mode, every hop and the light time, with Auto, policy and "Pin this route" buttons. The host dispatches the script's commands with `source: 'script'` |
| tests | `packages/sim/test/comms-routing.test.ts` (7); `fixtures/save-v6.json` and `make-save-v6.ts`; the web comms model (one new); the core save test |
| docs | ADR 0188; `simulation.md` gains "Comms tier 3"; `plugin-system.md`; `guides/scripting.md` gains "Signal delay"; the mod guide; the glossary |

## Decisions and deviations

- **Every vessel with an antenna relays**, and a link now goes to the first hop of a route.
  - In tier 1 a vessel linked straight to a station or a crewed vessel. `to` still names one endpoint, now the first hop, so the badge says "Linked to Relay".
  - The tier-1 events keep their meaning: link up and down by route.
  - Bisection still dates them on the direct rule. A change that only a relay causes is dated at the sample.
- **Auto is the widest path, from one multi-source tree** towards all control points. One tree serves every probe. Candidates for policies and for crewed vessels are the best route through each neighbour.
- **Capacities from reference margins.** The budget's margin falls by 20·log10(d) with distance. So one tier-2 budget per pair of antenna sets, at 1 m effective, gives every edge's capacity exactly. The full budget is computed only for first hops, for the inspector.
- **The queue drains at the start of a step.** A command dispatched at t0 with 3 s of light time applies in the step that starts at t0 + 3. Its effect shows after that step. The test checks that the step starts at 3 s to 1e-6.
- **Delay applies to probes only**, and only to the control commands. Planning (nodes, targets, warp) never waits, and crewed vessels never wait.
- **Format bump as the plan asks:** format 7 has a required `comms`. The fixture `save-v6.json` was written by `make-save-v6.ts` while format 6 was current, in this branch's first commit, before the bump.

## Measurements

- **Comms benchmark** (300 probes on rails, 10 bodies, network on against off), median of three pairs here: 180 to 207 µs per step after the optimizations. The budget is 500 µs; tier 1 measured 25 to 39 µs.
  - **The first routing version** cost 2.6 ms: candidates for every vessel, and linear edge lookups.
  - **The changes:** the tree branch for Auto probes, map lookups, reference margins, a squared-distance reject, a heap for the tree and sweep-and-prune along x for vessel pairs.
  - **Profile per network update before the last two changes:** pairs 8 ms, tree 3.4 ms, routes 1.6 ms.
- **Signal delay:** a throttle to a probe 3 light-seconds out is queued for t0 + 3.000 and applies in the step that starts then. Under `display` it applies in the next step, and the snapshot shows 3.0 s.

- **The career bot slowed** from about 32 s to 48.5 s at first: routing built its graph on every warp sample even with no vessel at all. A no-vessel fast path brought it back to 34 s.
- **The worlds-migration web test** expected format 6, and now expects the current format.

## Follow-ups

- 118: the contact timeline, coverage and the constellation planner on this graph.
- 119: data queues, using the shared rates.
- The EC draw of transmitters.
- Bisection on the routed graph, if relay-only changes need exact times.

## Verification output

```text
bun test packages/sim/test/comms-routing.test.ts  7 pass
bun test packages/sim/test/comms.test.ts          benchmark 180..207 µs per step alone (budget 500)
bun test packages/sim/test/career-bot.test.ts     plain 34 s alone (32 s before 117; 48.5 s before the
                                                  no-vessel fast path), in the band
bun run docs:check                                docs-check: OK (135 plans, 164 ADRs)
bun run test                                      1697 pass, 1 fail (764 s): the patch benchmark under load
bun run typecheck                                 exit 0
bun run --filter @orbital/web test                1006 passed, 1 skipped; CreateWorld timed out once under load
                                                  (6/6 alone); 4 env-only import suites (no Node here)
bun run build                                     exit 0
```
