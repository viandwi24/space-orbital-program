# 0101 — Communications: one physical model in six tiers, signal delay off by default

**Status:** accepted (point 4 default amended by ADR 0109)
**Date:** 2026-10-17
**Plan:** none (owner decisions "comms-ambition", "signal-delay", 2026-10-17); delivered by plans 114 to 121 (index: draft 070)
**Amends:** ADR 0079 (the plasma blackout becomes a real link loss once tier 1 ships).
**Research:** `refs/reverse-engineering-ksp2/09-communications-network.md`, `beyond/01-communications-network-and-radio.md`, `refs/space-orbital-program-ui/docs/CONCEPT.md` §4 (Comms tab).

## Context

Orbital has no antennas; the blackout badge (ADR 0079) loses nothing. The owner sees the network as the backbone that touches every role. The research proposed one model answering three questions: can we talk (line of sight and signal), how fast (link budget to a data-rate ladder), how late (light time plus queues), in six tiers. It recommended tiers 1 to 3 first (about M + M + L). **The owner chose tiers 1 to 6 as one programme**, accepting that it is XL and delays other systems. KSP1's CommNet uses no delay by default; the owner chose the same.

## Decision

1. **Comms is a stock plugin** (`mods/stock`, contribution `comms` through `ctx.provide`) on the public SDK: antennas as module configs (`defineAntenna`), bands (`defineBand`), ground stations from site buildings (`provides: comms-node`, ADR 0097), link modifiers (`defineCommRule`). Science, contracts and agencies depend on the contribution, and a mod could replace it.
2. **Deterministic in the sim Worker.** The network updates on a cadence (1 s of sim time at warp 1, and on events: staging, antenna toggled, SOI change); under warp, link up and down times are found by bisection like SOI crossings. Nodes in id order, ties by id. Network state (pinned routes, queues, licences) is world data; derived links are caches. The snapshot carries a compact `network` section. Planning tools run in a separate Worker from snapshots, never inside `step`.
3. **Tiers, each a complete slice:**
   - **Tier 1** antenna modules, line of sight (bodies and terrain), ground stations, three control states (full, partial, none), plasma blackout becomes real (the link drops while the heating flux is above the badge level), the map's Network layer.
   - **Tier 2** link budget (Friis) to a data-rate ladder, bands (UHF, S, X, Ka, optical), a per-world comms scale factor (real-scale link budgets are too generous for small bodies), a link inspector that names every term.
   - **Tier 3** dish pointing, a routing graph with Auto / Manual / Policy, shared capacity, latency; planning tools (contact timeline, coverage map, constellation planner with resonant deployment orbits).
   - **Tier 4** data items in priority queues (command > telemetry > voice > science > bulk), store-and-forward, contact-window prediction.
   - **Tier 5** channels, frequency licences, interference, encryption.
   - **Tier 6** crew suit radios relayed by landers and rovers, voice, live broadcasts of big events for reputation.
4. **Defaults (world rules):** `signalDelay`: `display` (default: delay is computed and shown, not enforced), `enforced` (commands arrive after the light time plus queueing), `flight-computer` (enforced, and scripts run on board as the vessel's computer). `controlWithoutSignal`: `full` (default), `partial` (SAS, staging and scripts but no manual input), `none`. `commsScale` as in tier 2. Sandbox can turn comms off entirely.
5. **UI.** The refs vessel panel's **Comms** tab (route Auto / Manual, network endpoints, radio channel, on-board transmitters including suit radios), signal bars on the crew panel synced with it, the Network layer in Map and Mission Center, and every broken link says why.

## Alternatives considered

- **Tiers 1 to 3 first** (research recommendation) — not chosen; the owner wants all six on the roadmap now. The tiers stay separate plans in that order, so stopping after tier 3 still leaves a complete system.
- **Delay enforced by default** (RemoteTech style) — rejected: frustrating for new players; kept as a rule.
- **Comms in core** — rejected: it would make the stock game special; the plugin keeps "stock is a mod".

## Consequences

- **Mod API:** `defineAntenna`, `defineBand`, `defineGroundStation` (also from buildings), `defineCommRule`, typed events (`comms:link-up`, `comms:link-down`, `comms:control-changed`, `comms:data-delivered`), `ship.comms` in the script API (additive per tier).
- **Save format:** bumps with migrations at tier 3 (pinned routes, policies) and tier 4 (queues, stored bundles).
- **Protocol:** the snapshot's `network` section; commands to toggle antennas, pin routes, queue and prioritise data.
- **Performance:** network update at most 0.5 ms average per sim step at 300 nodes and 10 bodies on the M5 reference (the research estimate of 450 000 visibility tests per update is culled by range and band); planning tools off the sim Worker; renderer layers within ADR 0053's budgets.
- **Risk:** XL delays other systems. Mitigation: the comms plans live mostly in `packages/sim`, `mods/stock` and the map layer, so they can run on one machine while the economy and screens proceed on others (STATUS foundation roadmap).
- Follow-ups: plans 114 to 121; draft 070 becomes their index.
