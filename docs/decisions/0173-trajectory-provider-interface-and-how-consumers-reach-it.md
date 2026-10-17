# 0173 — The trajectory provider: its interface and how consumers reach it

**Status:** accepted
**Date:** 2026-10-17
**Plan:** 080
**Builds on:** ADR 0095 (gravity model per world; patched conics now, n-body later), 0051 (spheres of influence), 0056 (maneuver nodes), 0084 (rendezvous aids), 0110 (`gravityModel` in the world info).

## Context

ADR 0095 puts every orbit prediction behind one interface, so an n-body model (plan 125) can replace patched conics per world. Today the sim (rails, SOI crossings, node prediction, target approach) and the web client (map path, rendezvous aids, and through them the maneuver controller and the script API) call about ten kepler functions directly, each taking the body list. The move must change no number, and the web functions are called from many places with a body list in hand.

## Decision

1. **Interface.** `TrajectoryProvider` lives in `@orbital/kepler` (`trajectory.ts`); core and the SDK re-export its types. It is bound to one body list and has `capabilities` (`model`, `maneuvers`, `soiTransitions`), `bodies`, `stateAt`, `bodyState`, `propagate`, `predict`, `predictWithManeuvers`, `track`, `trackOfSegments`, `bodyTrack`, `conicTrack`, `closestApproach`, `closestApproachOnTrack`, `conicClosestApproach` and `crossing`. The method set is what the consumers call today, no more.
2. **Patched provider.** `createPatchedProvider(bodies)` forwards every method to the existing function with the same arguments, defaults included. No algorithm moves, and a test checks each method against its function with `toEqual`.
3. **Selection.** `createTrajectoryProvider(model, bodies)` returns the patched provider for `patched` and throws "n-body worlds are not available yet" for `n-body`. The sim calls it once in `createSim` with the world's `gravityModel` and keeps it on `SimCore.trajectory`. A world with `n-body` is refused before that, by `worldInfoSchema`, and `createSim` reports it as a `SaveError` with code `incompatible`.
4. **Web callers keep their signatures.** `predictMapPath`, `predictManeuvers`, `patchedApproach`, `rendezvousAids` and the rest still take `bodies`. Inside, they call `trajectoryFor(bodies)`, which caches one patched provider per body list in a `WeakMap`. When n-body arrives, the page will pass the world's provider instead (plan 125), and callers that hold a list will not need to change before then.

## Alternatives considered

- **Change every web function to take a provider** — deferred: it touches every caller (HUD, map view, script API, tests) for no behaviour change, and plan 125 is the one that needs it.
- **Move the algorithms into provider classes** — rejected for this plan: "no number changes" is easiest to prove when the provider only forwards.

## Consequences

- **Core types:** `TrajectoryProvider`, `TrajectoryCapabilities` and `TrajectoryModel` are re-exported. `GravityModel` stays `'patched'`.
- **No save or protocol change.** The SDK gains type exports, an additive change, so `API_VERSION` gets a patch bump.
- Plan 125 adds an n-body provider and hands it to the web client, with the world.
