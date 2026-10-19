# 0220 — Flow locks, transfers as vessel jobs, measured rates, and keyed action ids

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/213-tank-transfer-and-flow.md
**Builds on:** ADR 0015 (resource graph through module stores), ADR 0174 (part action descriptors), ADR 0203 (transfer and flow rules)

## Context

Plan 213 asks for transfers between containers, a flow lock per resource and container, and rates and times to empty in the snapshot. It leaves open how a lock reaches the generic flow search, how a rate is known when engines, RCS, producers and consumers all touch the stores, and how a container offers one lock control per resource when a descriptor id names one action.

## Decision

1. **Store hooks:** `ResourceStore.capacity`, `locked` and `setLocked` (all optional). The sim's flow search (`eachStore`) skips a store that is locked for the resource, so engines, RCS and every other draw see the lock with no change to them.
2. **Transfers are jobs on the vessel** (`VesselState.transfers`), so a save keeps them. `runTransfers` runs after life support in flight and rails steps. Each step it moves `min(rate × dt, sources' amount, targets' room)` and ends a job that moves nothing. The `transfer` command refuses flow mode `none`, parts off the vessel, a part on both ends, and an empty or locked source or a full or locked target. `stop: true` ends the vessel's jobs for that resource. The default rate is the resource's `transferRate`, else 20 u/s; stock charge has 50 EC/s.
3. **Rates are measured, not modelled:** every 0.1 s each part's amounts are compared with its last sample (`PartState.rateBase`, `rateAt`). The net flow per resource is smoothed with `1 − e^(−span/1 s)` and kept in `PartState.rates`, so a resumed run continues the same numbers. Only vessels in flight or running a transfer are measured; a parked vessel on rails shows rate 0. Measuring every vessel every step made the career-bot tests three times slower. Time to empty is `amount / −rate` while draining, else null.
4. **Keyed action ids:** a descriptor id `name:key` calls action `name` with `key` as the first argument. The stock container offers `setLock:<resource>` toggles this way. The sim resolves it for the `action` command and for action groups.
5. **Transfer out / in** are trigger descriptors that do nothing in the sim. Plan 214's panel turns them into a picker that sends `transfer`.

## Consequences

- API_VERSION 0.1.80 (additive): the store hooks, `transferRate`, `transfer` and `set-flow-lock`, `ResourceSnapshot` on parts and vessels, `VesselSnapshot.transfers`, and the keyed action ids.
- The script API gains no transfer for now: the prelude exposes named functions, not commands by name. A `ship.transfer` can come with plan 214's panel.
- The debug API gains `send(command)` for tests.
