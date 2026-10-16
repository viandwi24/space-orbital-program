# 0020 — Scripting runtime: QuickJS in WASM with a per-tick interrupt budget

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/010-scripting-sandbox.md

## Context

Player scripts are untrusted. Requirements (plan 010): they cannot reach `world`, `fetch` or the DOM, they only see copies of telemetry and can only issue validated commands, and an infinite loop must be stopped within a budget without stalling the sim. The package must run in headless `bun test` (boundaries: environment-neutral) and later in a browser. Options verified in `research/scripting.md`.

## Decision

Run scripts in **QuickJS compiled to WASM** (`quickjs-emscripten` 0.32.0, `RELEASE_SYNC` build), one runtime and context per running script, driven synchronously by the host once per sim tick.

- **Isolation** is a separate JS engine instance with its own realm: it has only ECMAScript built-ins, so `Function('return this')()` and `constructor.constructor(...)` reach the QuickJS global, which contains nothing of the host. The only bridges are host functions the runner creates (`newFunction`); they are captured in a prelude closure and removed from the global, and every value crossing them is a JSON string the host parses and validates (commands go through core's `commandSchema`).
- **Budget** is a wall-clock deadline per tick (`budgetMs`, default 10 ms) enforced by `setInterruptHandler`, which QuickJS polls inside loops and calls. It covers the tick's telemetry update and pending promise jobs together. The first overrun terminates the script permanently (the context is disposed; no resume), as do a memory-limit hit (default 16 MiB) and a script exception. Stack depth is limited (256 KiB).
- **Honest limit:** the interpreter runs on the same thread as the caller, so a runaway script can delay the host by at most `budgetMs` once, and a well-behaved script costs up to its per-tick work every tick. It never blocks indefinitely, which a same-thread JS budget (a counter in guest code, a `Date.now()` check) cannot guarantee. Hosts that cannot afford even one budget of delay run the runner in a Worker (an arrangement the runner permits because it is a plain function of snapshots; not shipped by plan 010). The WASM module is audited neither by us nor upstream (README), so a Worker around the runner is the recommended defence in depth for the web client.
- **Time** is sim time: `wait(s)` resolves by comparing `snapshot.t`; the only clock read is the injectable `now()` used by the interrupt handler. `Math.random` in the guest is replaced by a seeded PRNG.
- The runner is a pure function of snapshots: `runner.tick(snapshot)` returns the commands to dispatch. It does not call the sim, so the sim never runs untrusted code, and the same runner works in-process, in a Worker, or over the web protocol (where dispatch is async).

## Alternatives considered

- **Dedicated Worker with a restricted global** — `terminate()` kills loops reliably, but a worker's globals (`fetch`, `postMessage`, `importScripts`) cannot be removed supportedly and `Function('return this')()` returns the real scope; it is a thread boundary, not a capability boundary. Bun's Worker termination is documented as experimental. Would also need a Worker per script in tests. Rejected as the *isolation* mechanism; remains the recommended *container* for the QuickJS runner.
- **Worker + QuickJS** — strongest, but ships a host-specific piece (Worker creation, message protocol) the plan's headless tests cannot exercise in Bun the same way; deferred to a draft plan (web integration).
- **`new Function` / `eval` with shadowed names** — no isolation (prototype escapes), no way to stop `while(true)`. Rejected.
- **ShadowRealm** — Stage 2.7, no interrupt, not shipped. Rejected.
- **Asyncify build** — lets host functions block guest code, but is slower and larger; `wait()` is implemented with promises and `executePendingJobs` in the sync build. Rejected.

## Consequences

- New package `@orbital/scripting` (imports `core` and `quickjs-emscripten` only; boundaries table updated). No `sim` import in `src` (sim is a test devDependency).
- Scripts are plain JavaScript (async function body), not TypeScript.
- Budget semantics are wall-clock, so slow machines can terminate a heavy script that fast ones run; `budgetMs` and `now` are options and the runner reports `elapsedMs` per tick.
- A terminated script cannot be resumed; the host restarts it.
- Follow-ups: draft plan for web integration (Worker host, editor UI).
