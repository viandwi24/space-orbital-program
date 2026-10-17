# 0179 — Comms tier 1: antennas, stations, the link rule, cadence, probe control and blackout

**Status:** accepted
**Date:** 2026-10-17
**Plan:** 114
**Builds on:** ADR 0101 points 1 to 4 (one model, tier 1, defaults), 0109 points 1 and 2 (command source, control without signal), 0079 (blackout law), 0097 (comms-node buildings), 0142 (sites), 0043 (terrain).

## Context

ADR 0101 sets tier 1: antennas, line of sight past bodies and terrain, ground stations, three control states, and a real plasma blackout. ADR 0109 makes probe control depend on a link. Open: the antenna and station data, how far a link reaches, where stations come from before building levels (096), what the network links to before relays (117), when it is recomputed, how link times are found under warp, which commands each control state refuses, where the engine lives, and what a crewed part without crew does.

## Decision

1. **Definitions.** `defineAntenna({ id, label, kind: 'omni' | 'dish', range, power })`: `range` is a rating in metres, `power` the transmit power in W (data only until 116). `defineGroundStation({ id, label, body, latitude, longitude, altitude?, range })` is a fixed station from a mod. Antenna parts use the stock module `stock.antenna` (config `{ antenna }`, state `{ enabled }`, toggle `setEnabled`). Stock: whip 5e5 m, dish 2e9 m, and a probe core part (a control source without seats) with a whip built in.
2. **Sites are stations.** Every world site is a ground station on its body at its latitude and longitude, 10 m above the ground. Its tier is the largest `comms-node` capacity of its active buildings, else 1 (until 096 builds them). Ranges by tier: 2e9, 5e10, 2.5e11 m. Station ids are `site:<id>`, or the definition id for registered stations.
3. **The link rule (direct, tier 1).** A vessel's range is that of its strongest enabled antenna. A vessel links to a **control point**: a station, or another vessel with a control source on a part with seats (a crewed command part) and an enabled antenna. It links when all of these hold:
   - the distance is under `√(range_a × range_b) × stock.comms-scale` (the KSP rule);
   - the segment misses every body sphere;
   - where the segment is within the highest terrain of a body, none of 16 samples along it is below the ground;
   - the vessel is not in plasma blackout.

   The nearest control point that passes wins, ties by id. Without a link the reason is the first failing check, in this order: `no antenna`, `antennas off`, `plasma blackout`, `out of range`, `blocked by <body>`, `blocked by terrain`. Relays are 117.
4. **Cadence and bisection.** The network is recomputed after a step when 1 s of sim time has passed since the last update, and at once after staging, an antenna toggle, an SOI change, or a vessel being created or removed. In a rails chunk it is sampled at most 10 s apart. When a vessel's link changes between two samples and its motion is on rails, the time is found by bisection on its rails position, the bodies and the stations at that time, to 0.01 s. In flight the change is dated at the sample. Events: `comms:link-up { vessel, to, time }`, `comms:link-down { vessel, reason, time }`, `comms:control-changed { vessel, control }`.
5. **Probe control (ADR 0109).** A vessel whose control sources all sit on parts without seats is a probe. A probe without a link is controlled per `stock.control-without-signal`:
   - `full`: no change;
   - `partial`: `throttle` and `attitude` are refused (no manual input);
   - `none`: also `sas`, `stage`, `action` and `action-group`. SAS keeps its last mode.

   Each refusal says why: `no signal (<reason>): probe control is <state> (stock.control-without-signal)`. Maneuver nodes, targets and warp are planning, and are never refused. With `stock.comms` off there is no network and control is full.
6. **A crewed command part counts as crewed without crew**, as before 106. The launch flow does not seat crew yet (108), so requiring crew now would leave every crewed design uncontrollable. The crew half of ADR 0109 point 1 lands with 108.
7. **Blackout from the sim.** The blackout law (`blackoutLevelFromFlux`, `BLACKOUT_FLUX_START`, `BLACKOUT_FLUX_FULL`, `BLACKOUT_BADGE_LEVEL`) moves to `@orbital/core`, and the renderer re-exports it. The sim takes the stagnation flux at the vessel from its own heating model (nose radius 0.625 m, the ambient density, the air-relative speed). At or above the badge level, the link is down.
8. **Where it lives.** As with science (ADR 0178), the engine is in the sim (`packages/sim/src/comms.ts`): links must refuse commands at the sim boundary, and they need rails positions and terrain. The content (antennas, stations, rules) is stock. Other plugins read the result through `ctx.vessel.signal()` (`{ connected, to, reason, control }`) and the events. This is the `comms` contribution of ADR 0101 point 1. A mod that replaces comms is a later contract.
9. **Snapshot and save.** `Snapshot.network = { stations: [{ id, label, body, position, range }], vessels: [{ vessel, to, reason, control, blackout }] }`. Positions are system-relative like `Snapshot.bodies`. Links are derived, so they are recomputed on resume without events. Antenna on or off is module state. The save format is unchanged.

## Alternatives considered

- **Comms as a pure stock system through the SDK** (ADR 0101 point 1 as written): rejected for now. Systems cannot refuse commands, and they see neither rails positions nor terrain. Exposing that is a larger contract than tier 1 needs.
- **Every antenna summed with KSP's 0.75 exponent:** deferred to the link budget of 116. The strongest antenna is simpler to read.
- **Requiring crew in a crewed pod now:** rejected (point 6).
- **Recomputing every step:** rejected for cost. Links change slowly, and the bisection gives the exact time.

## Consequences

- **Mod API:** `defineAntenna`, `defineGroundStation`, `ctx.vessel.signal()`; additive, `API_VERSION` patch bump. Load report kinds are `antenna` and `ground-station`.
- **Protocol:** `Snapshot.network` and three events. Commands get new refusals for probes without signal in Career and Science, where `none` is the preset value. Sandbox (`full`) and the Legacy world are unchanged.
- **Follow-ups:** 115 (UI and the map layer), 116 (rates, bands, the combined range, EC draw), 117 (relays and routing), 108 (crew required in crewed parts).
