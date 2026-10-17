---
id: 098
title: "Objectives: the evaluator behind contracts and missions"
status: in-progress
owner: "Agent 3"
depends: [078, 082]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 098 — Objectives: the evaluator behind contracts and missions

## Goal

One deterministic objective evaluator exists: `defineObjective` primitives (reach orbit with bounds, land in a region, return a sample, hold a comms link for a time, deliver a payload, by a date) compose into `defineContract` and `defineMission` data, are evaluated on events and on the world tick, and report progress per objective.

## Context

- ADRs: 0098 point 4, 0104, 0113 (ledger: rewards and penalties are entries), 0171 (world tick), 0175 (written in step 1: tree semantics, scheduling, vessel binding, save field).
- Read: `refs/reverse-engineering-ksp2/06-missions-contracts-achievements.md`, `packages/core/src/economy.ts` and `packages/sim/src/economy.ts` (`record`, `economyOn`), `packages/sim/src/sim.ts` (step, tick), `packages/sim/src/orbit.ts` (`elementsOf`, `motionOf`), `packages/sim/test/helpers/ascent.ts`, `packages/sim/test/scenario-orbit.test.ts`.

## Scope

**In:**
- `defineObjective({ id, label, params, on?, constraint?, evaluate })`: `params` a zod schema; `evaluate(params, view, prior) → { status: active | done | failed, progress 0..1, data? }`, pure over a read-only `ObjectiveView` (time, vessels with body, mode, landed, altitude, periapsis, apoapsis; home body) and its own prior leaf state. `on` lists `'step'`, `'tick'` or event names (default `['step']`). A `constraint` leaf (such as a date limit) is re-evaluated every time; other leaves are sticky once done.
- Stock primitives: `stock.reach-orbit { body?, minPeriapsis, maxApoapsis? }`, `stock.land { body? }`, `stock.reach-altitude { body?, min }`, `stock.enter-soi { body }`, `stock.flyby { body }` (entered, then left), `stock.return-home` (landed on the home body), `stock.before { time }` (constraint). Return a sample, hold a comms link and deliver a payload are named in ADR 0175 for plans 103, 114 and 128; no placeholder code.
- Trees: `{ objective, params } | { all: [...] } | { any: [...] } | { sequence: [...] }`. A sequence evaluates only its current step.
- `defineContract({ id, title, objectives, reward?, penalty?, deadline?, prerequisites? })` and `defineMission({ id, title, objectives, reward?, prerequisites? })`: rewards and penalties are `{ currency, amount }` written to the ledger (cause = the contract or mission id) when the economy is on.
- Command `objective-start { source: { kind: contract | mission, id }, vessel? }` (prerequisites checked); events `objective:completed`, `objective:failed`; `Snapshot.objectives` (status, progress per leaf); state in an optional `SimSave.objectives` (format 5, no bump).
- Scheduling: after each flight step and rails chunk, active objectives whose current leaves listen to `'step'`, or that a listened event marked, are evaluated; on each world tick those listening to `'tick'`.

**Out:** generation of offers and the accept / decline flow (099), the story line and mission UI (100), abandoning an objective (099).

## Touches

- **Size:** S
- **Edits:** `packages/core` (`objectives.ts` new, `registry.ts`, `plugin.ts`, `definitions.ts`, `protocol.ts`, `protocol-schemas.ts`, `events.ts`, `save.ts`, `version.ts`, `index.ts`), `packages/sdk`, `packages/sim` (`objectives.ts` new, `core.ts`, `sim.ts`, `commands.ts`, `snapshot.ts`, `save.ts`, tests), `mods/stock` (primitives, tests), `docs/architecture/plugin-system.md`, `docs/architecture/simulation.md`, `docs/guides/writing-a-mod.md`
- **Shared contracts:** **SDK (`defineObjective`, `defineContract`, `defineMission`, `ctx.objectives/contracts/missions`; `API_VERSION` patch bump), protocol (`objective-start`, events, `Snapshot.objectives`), save (optional `SimSave.objectives` in format 5), load report kinds `objective`, `contract`, `mission`**

## Design notes

Evaluation cost is O(active objectives) per event; primitives subscribe to the events they need.

## Steps

1. ADR 0175; types, schemas, registries; the pure tree evaluator with core tests.
2. Stock primitives with tests.
3. Sim: `objective-start`, scheduling after steps, ticks and events, rewards, snapshot, save.
4. Ascent, sequence and resume tests.

## Acceptance criteria

- [ ] `bun test packages/sim/test/objectives.test.ts`: a "reach orbit with periapsis over 80 km" objective completes in the headless ascent scenario (ascent options aiming at 85 km) on the first step whose snapshot periapsis is over 80 km; `objective:completed` carries that step's time.
- [ ] Same file: a sequence (orbit, then return home) does not complete when the return happens first (a vessel landed at home from the start), and completes after an orbit and a landing in that order (rails-level fixture).
- [ ] Same file: a save with an active objective resumes and the objective completes at the same time, with the same snapshot, as the uninterrupted run; a save without `objectives` loads.
- [ ] `bun test packages/core/test/objectives.test.ts`: all / any / sequence status rules, sticky leaves, a constraint leaf failing its tree; rewards on completion and penalties on failure are ledger entries when the economy is on (sim test).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/098-objectives-contract-and-mission-definitions.md` written.
- [ ] `plugin-system.md`, `guides/writing-a-mod.md` (objectives).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098, 0104).
- 2026-10-17 — Refined and claimed by Agent 3. Active objectives live in an optional `SimSave.objectives`, like `economy` (095) and `worldTick` (082), so entity ids do not shift and there is no format bump. Primitives are pure over a read-only view plus their own prior state, and are evaluated after steps, ticks and the events they name. The default ascent ends at a 76 km periapsis, so the test aims at 85 km. Design choices go in ADR 0175.
- 2026-10-17 — Implemented as refined. The ascent test completes the orbit objective at 230.48 s, the step the snapshot periapsis passes 80 km.
