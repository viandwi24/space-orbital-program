---
id: 010
title: Scripting sandbox
status: draft
owner: ""
depends: [009]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 010 — Scripting sandbox

## Goal

Players (and mods) can run untrusted scripts that read telemetry and issue commands (throttle, attitude, stage, actions) through a limited API, isolated from game state. Decide the runtime (dedicated Worker with a restricted global vs QuickJS-in-WASM) via an ADR after verifying current options online.

## Context

- Read: `docs/architecture/simulation.md` (commands), `plugin-system.md` (actions).
- Product spec §4 "Later".

## Scope

**In:** runtime decision (ADR), `packages/scripting` created with `bun init --yes`, API surface (`ship.altitude`, `ship.throttle = …`, `stage()`, `wait(s)`), per-tick budget/timeout, a sample autopilot script replicating the plan 007 ascent.
**Out:** editor UI polish, script sharing.

## Acceptance criteria

- [ ] ADR written and accepted for the runtime choice.
- [ ] `bun test packages/scripting`: an infinite-loop script is terminated within the budget without stalling the sim; the sample ascent script reaches orbit in the headless sim.
- [ ] Scripts cannot access `world`, `fetch`, or DOM (test attempts fail).

## Docs checklist

- [ ] `docs/STATUS.md`, journal, `architecture/scripting.md` (new), ADR.

## Log

- 2026-10-16 — Created as draft.
