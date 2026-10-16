---
id: 016
title: Landed vessels on surface-fixed rails
status: draft
owner: ""
depends: [012, 013]
phase: 3
created: 2026-10-16
updated: 2026-10-16
---

# 016 — Landed vessels on surface-fixed rails

## Goal

A controlled vessel standing on the ground (the rocket on the pad, a lander after touchdown) stays in `flight` mode forever, so `warp` is refused on the pad and after landing ("time warp needs every vessel on rails"). Plan 013 only removes uncontrolled debris. Let a vessel at rest on the ground go on rails in a surface-fixed state (it rotates with the planet, keeps its orientation relative to the ground), so a player can warp to wait for an orbital window.

## Context

- Read: ADR 0021 (debris rules, why landed vessels were left out), ADR 0019 (ground tile, `landed`), `architecture/simulation.md` (Vessel modes), `packages/sim/src/modes.ts`, `orbit.ts`, `snapshot.ts`.
- Open questions: a new `RailsState` kind (`'surface'`: latitude, longitude, heading, height) vs a flag; how `snapshot` reports position and orbit (no orbit); wake-up on `throttle`/`stage` with the existing rule; interaction with the 2 s idle rule and the ground tile (hysteresis); what the existing "warp refused on the pad" test becomes.

## Scope

**In:** surface rails, waking up, snapshot, tests (pad vessel warps; a lander warps after landing; wake and launch still work).
**Out:** terrain heights, tipping/rolling stability beyond "at rest" (speed and tilt thresholds), multiple bodies.

## Steps

1. Refine: ADR, measurable criteria.

## Acceptance criteria

- [ ] To be written when refined.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, `simulation.md`, ADR, glossary.

## Log

- 2026-10-16 — Created as draft by plan 013 (landed controlled vessels still block time warp).
