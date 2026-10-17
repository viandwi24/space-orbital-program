# 0095 — Gravity model per world: patched conics now, n-body "Coming soon", one trajectory provider

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decision in chat, 2026-10-17); delivered by plans 080, 087; n-body itself is draft 125
**Builds on:** ADR 0051 (body tree, SOI transitions), 0056 (maneuver nodes, shared prediction), 0065 (targets), 0083 (trip planner), 0084 (rendezvous aids).
**Research:** `refs/reverse-engineering-ksp2/beyond/05-universe-mode.md`, `beyond/09-time-and-real-solar-system.md` §3.4.

## Context

Orbital, like KSP, uses patched conics: a vessel feels one body at a time, orbits are exact functions of time and warp reaches 1e6. An n-body model (as the KSP1 mod Principia does) gives Lagrange points, perturbations and smooth gravity assists, but predictions become numerical and warp is limited. The owner wants the choice to exist per world eventually, but v1 of the foundation ships patched conics only. Today several consumers call patched-conic functions directly: the sim's rails and SOI code (`kepler.findCrossing`), maneuver nodes (`kepler.predictWithManeuvers`), the map path (`predictPatchedConics`), rendezvous aids (`patchedTrack`, `closestApproachPatched`), the trip planner and the script API (`ship.orbit`, node data).

## Decision

1. **World field `gravityModel`**: `'patched'` (the only accepted value now) or `'n-body'`. It is an identity rule (ADR 0094 point 4), saved with the world, validated at the boundary: a save or a create request with `'n-body'` is refused with a clear reason ("n-body worlds are not available yet") until draft 125 ships.
2. **Create World shows the choice**: "Gravity: Patched conics" selected, "N-body — Coming soon" visible and disabled, with one line on what it will mean (smoother assists, Lagrange points, slower warp).
3. **One trajectory provider interface** in `@orbital/kepler` (types re-exported by core): given the body tree and a vessel state, it answers `stateAt(t)`, `predict(start, horizon, nodes)` (segments with entry, exit and why each ends), crossing times, closest approach to a target, and its capabilities (`exact` for analytic paths, the maximum warp it supports). The patched-conics implementation wraps today's functions with **no behaviour change**: every existing prediction, crossing and node test returns the same numbers.
4. Every consumer listed above goes through the provider chosen by the world's gravity model; the sim picks it at `createSim` from the world fields.
5. **The future n-body model is restricted n-body**: bodies stay on rails (their own analytic or ephemeris paths, ADR 0103), vessels are pulled by every body and integrated numerically. Its data source for the real solar system is JPL DE440 (ADR 0103); warp limits, prediction horizon and the frame strategy are decided in its own ADR when draft 125 is refined.

## Alternatives considered

- **Do nothing until n-body is built** — rejected: retrofitting six call sites later is the rework the owner wants to avoid, and the world field must exist before worlds are created.
- **Offer n-body now** — rejected by the owner: v1 of the foundation stays patched; n-body would delay every other system.
- **Full n-body including bodies** (Universe Sandbox style) — rejected with Universe mode (ADR 0108).

## Consequences

- **Core types / mod API:** `TrajectoryProvider` and `GravityModel` types (additive). Mods do not implement providers yet.
- **Save format:** `gravityModel` is part of the format 5 world fields (ADR 0094).
- **Performance (ADR 0053):** the patched provider is a thin wrapper; plan 080 measures that the map path and node prediction stay within 2 % of today's time.
- **Script API:** unchanged; scripts read through the same provider.
- Follow-ups: plan 080 (interface, consumers moved, no behaviour change), 087 (UI), draft 125 (n-body).
