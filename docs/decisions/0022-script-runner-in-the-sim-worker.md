# 0022 — The script runner lives in the sim Worker

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/015-scripting-web-integration.md

## Context

ADR 0020 made the runner a pure function of snapshots (`runner.tick(snapshot) -> commands`) that runs on the caller's thread and recommended a Worker around it. The web client already has one Worker (ADR 0006, plan 009): `sim-host.ts` steps the sim, answers commands and posts a snapshot per tick (about 60 Hz). Plan 015 must decide where the runner runs: inside that sim Worker, or in a second Worker of its own.

## Decision

Run the runner **inside the sim Worker**, driven by `sim-host.ts`: after each `sim.step` the host takes the snapshot, calls `runner.tick(snapshot)` with the active vessel, dispatches the returned commands with `sim.dispatch` and posts status and `print` output to the page (`script-start` / `script-stop` in, `script-status` / `script-log` out). The page never hosts QuickJS. The WASM is loaded with `newQuickJSWASMModule(newVariant(RELEASE_SYNC, { wasmLocation }))` where `wasmLocation` is the bundled asset URL (`@jitl/quickjs-wasmfile-release-sync/wasm?url`), because the default loader's `new URL(..., import.meta.url)` sits in a dependency and Vite's dev dependency optimiser moves it.

`@orbital/scripting` gets one additive function, `createScriptRunnerIn(module, source, options)`, so the host supplies the WASM module; `createScriptRunner` (shared `getQuickJS()`, used by Bun tests) moved to its own file. The split exists because the bundler follows every variant's `.wasm` reference of the `quickjs-emscripten` barrel before tree-shaking: the Worker imports only `@orbital/scripting/runner` and the single variant package, and the build contains one 503 KB `.wasm` (journal 015).

## Alternatives considered

- **Own script Worker.** Pros: a stall or a WASM crash cannot touch the sim loop; `Worker.terminate()` kills even a runner that ignores its budget; the sim thread pays nothing for script work. Cons: every snapshot must be forwarded (a second structured clone at 60 Hz, or a MessageChannel between the Workers, both new protocol), commands return over a second hop so a script acts on 2+ ticks old data (the sample uses a PD attitude loop; extra latency changes its behaviour and makes it timing-dependent), two clocks to reconcile under time warp, a second WASM boot and a second Worker bundle. Rejected for now: none of the stalls it prevents is unbounded, because the interrupt budget already bounds them.
- **Runner on the main thread.** A runaway script costs a frame (up to `budgetMs` once), a healthy one costs frames every tick. Rejected: the point of plan 015 is that scripts cannot cost frames.

## Consequences

- Cost is bounded and measurable: a runaway script delays one sim tick by at most `budgetMs` (10 ms) and is then terminated; a healthy script adds its per-tick work to every sim tick, which can use up to 10 ms of the 16 ms period. A heavy script slows the sim rather than the page; the status message reports the last and worst tick time.
- Commands are dispatched synchronously in the same host tick as the snapshot that produced them: deterministic relative to sim time, no round trip.
- The security reasoning of ADR 0020 holds with a weaker container than the second-Worker variant: if QuickJS-WASM (unaudited upstream) were escaped, the attacker would be in the sim Worker, which has no DOM or page access but does hold the sim. Moving the runner to its own Worker is a contained change later (the runner does not change, only `sim-host.ts` and the messages); to be revisited before scripts can be shared between players.
- Only one script runs per Worker, controlling one vessel.
