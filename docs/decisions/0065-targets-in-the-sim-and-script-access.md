# 0065 — Targets: sim-owned, one relative state, closest approach from conics, scripts read and set them

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/035-script-target-and-maneuver-data.md
**Builds on:** ADR 0049 (SAS), 0051 (body tree, shared inertial axes), 0056 (nodes are sim state), 0020/0031/0039 (script sandbox, command path, warp hold). Research: none needed (conic closest approach is a bounded numeric search over `kepler.propagate`).

## Context

Plan 045 shipped the maneuver half of plan 035. What was left: a target a vessel can aim at (another body, or another vessel such as a piece of debris), the relative position and velocity of it, the closest approach of the current orbit, SAS modes that point at it, and scripts that can read and set all of it, plus a body's state at a given time.

## Decision

1. **The target is sim state** on the vessel (`VesselState.target`: `{ kind: 'body', id }` or `{ kind: 'vessel', id }`), like nodes: saved, resumed, visible to scripts and the HUD alike. Command `target-set { vessel, target | null }` (API 0.1.17); refusals: itself, an unknown body or vessel, a vessel without a command part. `VesselSnapshot.target` carries the ref plus `name`, `position` and `velocity` of the target **relative to the vessel's centre of mass in the shared inertial axes** (the same axes in every body's frame, ADR 0051, so the numbers mean the same whichever sphere either is in), `distance`, `relativeSpeed` and `approach`. `VesselSnapshot.name` is new (the design name, or "... (debris)"), so a list of vessels can be named.
2. **Closest approach is computed in the sim, only for a vessel with a target,** by the new `kepler.closestApproach(from, to, t0, t1, samples)`: a scan at 240 samples and a golden-section refinement around the best one (global over the window, exact to about a micrometre of time; it can miss a minimum narrower than one sample interval). The window is the vessel's next revolution, at most ten days. It is offered when both move on conics about the same body: a vessel and another vessel in the same sphere, or a vessel and a body that orbits its sphere's body (the moon from a home orbit). It is `null` otherwise (different spheres, a target that is the vessel's own primary, a vessel on the ground, an orbit that dips into the ground). Patched-conic encounters stay the map's job (ADR 0051). Cost measured at 0.075 ms per snapshot.
3. **Lifecycle.** A target vessel that is destroyed or reaped drops out of every target after the step (`vessel:target-lost`); when a vessel splits, the target goes with the half that can still be flown, like the nodes. **Save format 4** (a migration 3 to 4 gives every vessel `target: null`; frozen fixture `save-v4.json`), because an older reader would silently drop the field.
4. **SAS `target` and `anti-target`** (additive to ADR 0049): the direction is the unit vector to the target (or away), no target gives a mode with no direction, like `maneuver` without a node; on rails the nose follows analytically.
5. **Scripts.** Telemetry gets `ship.target` (null or the snapshot's block, id as number for a vessel and string for a body) and `ship.targets` (every body then every other vessel: `{ kind, id, name }`). `setTarget(spec)` is a global returning a promise of `{ ok, reason? }`, like `addNode`; `spec` is a body id, a vessel id, an entry of `ship.targets` or `null`. `ship.sas` accepts the two new modes. **`bodies[id].state(t, frame?)`** returns `{ position, velocity }` of a body at simulation time `t` from its orbit, relative to its parent (`'parent'`, default) or to the root's centre (`'system'`). The host computes it: the runner takes an injected `bodyState` provider (boundaries.md keeps `kepler` out of `scripting`), the web client builds it from `kepler.bodyStateAt` (new, pure) in the script Worker. The method is not enumerable and the `bodies` data stays frozen; it validates its arguments in the host.
6. **What a script's Worker is sent.** Until now only the controlled vessel. Now the others come too, **without their parts**, so `ship.targets` can name them; no other data of them reaches the guest except through `ship.target` (the chosen one). `scriptView` in `script-channel.ts` builds it.
7. **A latent gap closed.** The web sim host allowed a script only `throttle`, `attitude`, `stage`, `action` and `warp`; `sas`, `node-set`, `node-remove` and `warp-to` (plans 042, 045) were refused as "not allowed for scripts" in the browser although headless tests passed. The host now allows them and `target-set`, checks the vessel as for the others, and treats `warp-to` like `warp` for the hold of ADR 0039. The hold also ends when the sim ends a warp itself (a finished `warp-to`, a sphere change), which it did not before.
8. **HUD.** A Target card (a select of bodies then other vessels, distance, relative speed, range rate, closest approach), key `Y` to step through the list and none, SAS buttons and keys `9` and `0`. Navball and map markers for the target are not in this plan (draft 057).

## Alternatives considered

- **Target in the page only:** scripts and saves would not see it, SAS in the sim could not use it. Rejected (as for nodes, ADR 0056).
- **Closest approach in the page/guest:** two implementations to keep equal, and the guest cannot call `kepler`. Rejected.
- **A kepler dependency for `scripting`** (to compute `bodies.state` in the guest host): breaks the boundary. An injected provider keeps it and costs one option.
- **Sending scripts the whole snapshot:** parts of other vessels are never read; the clone cost is real. Parts are dropped.
- **`ship.target = ...` as a setter:** cannot report a refusal. `setTarget()` returns the verdict like `addNode`.
- **Closest approach through patched conics** (across spheres): the map already shows encounters; a general version needs the prediction in the sim for non-controlled vessels. Draft 057.

## Consequences

- `docs/architecture/simulation.md`, `scripting.md`, `guides/scripting.md`, glossary and the SAS help list updated; API 0.1.17.
- `ship.targets` lists vessels by name only; two vessels with one name are told apart by `id`.
- The sim's snapshot grows by `name` per vessel and a `target` block for the vessel that has one.
