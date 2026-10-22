---
id: 333
title: "Rendezvous says why it cannot start and what to do next; delta-v while off"
status: done
owner: "rendezvous session (Claude)"
depends: [331, 332]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 333 — Rendezvous readiness and the next step

## Goal

When the Rendezvous cannot start, the panel gives the true reason with numbers and a button to the program that fixes it; its delta-v read-outs show figures while it is off.

## Context

- Owner on the deployed build (2026-10-22): "kenapa ini ga bisa". Rendezvous tab: "The target orbits another body."; target 34 km away at 447 m/s; delta-v `[—]`; Engage off; the time bar "Max 10× — engine running". The vessel was still climbing.
- Cause: `targetOf` read `approach === null` as another body; `approachOf` (sim `target.ts`) is also null when the own periapsis is under the surface or the target has no conic.
- ADRs 0287, new **0288**.

## Scope

**In:** the readiness check (autopilot and panel), the notice button, `PanelInput.body` and `.deltaV`, tests.
**Out:** a hint for a running engine (the snapshot has no throttle; the time bar says it already).

## Steps

1. Panel input and notice action (core, web); the readiness check and the panel (guidance); tests; commit.
2. ADR, plan, journal, guide; commit.

## Acceptance criteria

- [x] `bun test mods/guidance`: each reason (climbing, periapsis in the air, target around another body, landed, suborbital) with its text and button; ready shows the HUD delta-v and an estimate; the sim refuses engage below a stable orbit with the numbers.
- [x] web vitest: the panel input carries the body and delta-v; a notice's action is evaluated and drawn.
- [x] `bun run typecheck` (svelte-check), `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` board row.
- [x] `docs/journal/333-rendezvous-readiness-and-next-step.md`.
- [x] Guide: panel input and the notice action; the rendezvous reasons.

## Log

- 2026-10-22 — Done in the rendezvous session. `bun test mods/guidance mods/autodock packages/core/test`: 408 pass; web vitest dock, mods, onboarding: 78 pass; svelte-check 0 errors.
