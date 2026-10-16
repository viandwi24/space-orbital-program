---
id: 010
title: Scripting sandbox
status: in-progress
owner: "scripting session (Claude, 2026-10-16)"
depends: [009]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 010 — Scripting sandbox

## Goal

Players (and mods) can run untrusted scripts that read telemetry and issue commands (throttle, attitude, stage, actions) through a limited API, isolated from game state. The runtime is QuickJS compiled to WASM with a per-tick interrupt budget (ADR [0020](../decisions/0020-scripting-runtime-quickjs-wasm.md), options verified in `research/scripting.md`).

## Context

- Read: `docs/architecture/simulation.md` (commands, snapshots), `plugin-system.md` (actions), `boundaries.md`, ADR 0020, `docs/research/scripting.md`.
- Product spec §4 "Later". Journal 007 (the scripted ascent that the sample script reproduces), 009 (web protocol: the worker owns the clock, dispatch is an async round trip).

## Scope

**In:** runtime decision (ADR 0020); `packages/scripting` created with `bun init --yes`; API surface (`ship.<telemetry>`, `ship.throttle = …`, `ship.attitude = …`, `stage()`, `action()`, `wait(s)`, `waitUntil`, `nextTick`, `print`); per-tick time budget, memory and stack limits; a sample autopilot script replicating the plan 007 ascent; the boundaries entry for the new package.
**Out:** editor UI polish, script sharing, wiring into `apps/web` and running the runner in a Worker (draft plan), TypeScript scripts, `Date`/wall-clock hiding.

## Design notes

- `createScriptRunner(source, options)` (async: loads the WASM module once) returns a runner; `runner.tick(snapshot)` returns `{ commands, status, elapsedMs }`. The runner never calls the sim: the host dispatches the commands. The vessel id is fixed by the runner.
- **Budget** = wall-clock milliseconds of guest execution per `tick` (default 10 ms), enforced by QuickJS's interrupt handler; covers the telemetry update, the script's synchronous part and all promise jobs of that tick. First overrun terminates the script (`status: 'terminated'`, runtime disposed). Memory limit 16 MiB and stack 256 KiB per script; exceeding memory also terminates.
- Scripts are async function bodies. `wait(s)` resolves on simulation time (`snapshot.t`); `nextTick()` on the next call to `tick`.
- Telemetry crosses as a JSON string per tick (copies only); commands cross as JSON strings, built from named fields and validated with `commandSchema`.

## Steps

1. Research and ADR (done in refinement): `docs/research/scripting.md`, ADR 0020.
2. Scaffold `packages/scripting` (`bun init --yes`, move `index.ts` → `src/`, tsconfig without DOM, workspace deps) and add `quickjs-emscripten`.
3. `telemetry.ts` (snapshot → `Telemetry`), `prelude.ts` (guest API, closure-captured host bridge), `runner.ts` (limits, interrupt budget, job pump, command validation, status).
4. Sample script `samples/ascent.ts` using only the scripting API.
5. Tests: budget (sync loop, microtask spin, swallowed interrupt, memory, recursion, well-behaved script), API (telemetry copy, commands, validation, wait, errors, seeded random), sandbox (forbidden globals, escape tricks, surface), ascent.
6. Mutation-check the sandbox and budget tests; docs (architecture/scripting.md, boundaries, AGENTS map, glossary, STATUS, journal).

## Acceptance criteria

- [x] ADR 0020 written and accepted for the runtime choice.
- [x] `bun test packages/scripting`, infinite loop: `while (true) {}` (and a microtask spin) is terminated on the tick it starts, within `budgetMs` plus a stated slack (test: budget 25 ms, elapsed < 275 ms), and over the following 100 `sim.step(0.02)` calls the sim time advances by exactly 2 s with no iteration slower than the budget (`budget.test.ts`).
- [x] `bun test packages/scripting`, sample ascent: the script in `src/samples/ascent.ts` flies the stock two-stage vessel to an orbit with periapsis > 70 km and eccentricity < 0.1 in under 1200 s of sim time, finishing (`status: 'finished'`) with every tick inside the default 10 ms budget (`ascent.test.ts`; numbers in the Log).
- [x] Scripts cannot access `world`, `fetch`, or the DOM: tests probe `world`, `fetch`, `window`, `document`, `self`, `process`, `Bun`, `require`, … (all `undefined`), direct use throws `ReferenceError`, and `Function('return this')()`, `constructor.constructor(...)`, indirect `eval` only ever reach the guest global (`sandbox.test.ts`).
- [x] The package's whole test run takes under 60 s.

## Docs checklist

- [x] `docs/STATUS.md`, journal, `architecture/scripting.md` (new), ADR 0020, `boundaries.md`, `AGENTS.md` repo map, glossary, `research/scripting.md` and `stack-versions.md`.

## Log

- 2026-10-16 — Created as draft.
- 2026-10-16 — Refined draft → ready at the human's request (session: scripting session). Researched Worker vs QuickJS-WASM vs ShadowRealm (`research/scripting.md`), chose QuickJS-WASM (ADR 0020), defined the budget (ms of guest wall time per tick), made the runner a pure snapshot-to-commands function, moved web wiring out of scope.
- 2026-10-16 — ready → in-progress.
