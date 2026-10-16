---
id: 013
title: Debris lifecycle and time warp
status: draft
owner: ""
depends: [007]
phase: 1
created: 2026-10-16
updated: 2026-10-16
---

# 013 — Debris lifecycle and time warp

## Goal

After staging, the discarded stage ("<name> (debris)") must not block time warp for minutes. Found in plan 009's manual run: the debris of the two-stage ascent keeps `mode: flight` (its periapsis is inside the atmosphere, so it never goes on rails) and stays alive for more than 2.5 simulated minutes after reaching orbit, so `warp` is refused with "time warp needs every vessel on rails; in flight: ...". A player cannot warp after a normal launch.

## Context

- Read: `docs/architecture/simulation.md` (Vessel modes, time warp), `docs/journal/009-web-client-mvp.md`, plan 012 (ground contact and impact damage; debris that falls to the ground).
- Candidates (decide by ADR): despawn uncontrolled debris above a distance or after a timeout; let debris with a suborbital path go on rails and be removed analytically at atmospheric entry; or allow warp with flight vessels that have no control source and are far from the focus.

## Scope

**In:** the chosen rule in `packages/sim`, tests, a HUD-visible reason is already present (the refusal names the vessel).
**Out:** orbital debris management, collision between vessels.

## Steps

1. Reproduce headlessly: scripted ascent, then `warp` 5 at 400 s expecting success.
2. ADR with the chosen rule; implement; test that warp succeeds after the scripted ascent.

## Acceptance criteria

- [ ] A test fails before and passes after: scripted ascent, run to orbit, `dispatch({ type: 'warp', factor: 5 })` is ok within a documented time, with the debris handled by the chosen rule.
- [ ] `bun test`, `bun run typecheck`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/architecture/simulation.md` (time warp rule), ADR, `docs/STATUS.md`.

## Log

- 2026-10-16 — Created as draft (found by plan 009).
