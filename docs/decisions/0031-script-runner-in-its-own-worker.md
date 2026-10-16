# 0031 — The script runner moves to its own Worker; ship API gains engine and wheel constants

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/018-script-sharing-and-ship-api.md
**Amends:** ADR 0022 (runner placement). ADR 0020 (QuickJS, interrupt budget) still holds. **Amended by:** ADR 0038 (the script Worker now lives in a sandboxed iframe; budgets 200/300 ms).

## Context

ADR 0022 put the runner inside the sim Worker and said to revisit before scripts can be shared between players. A public release means players paste other players' scripts, so the script is hostile input. Two things were measured for this decision (journal 018):

- The interrupt budget is not a hard bound. QuickJS polls the interrupt inside loops and calls, not inside native builtins. `('a'.repeat(1e7)+'b').indexOf('a'.repeat(5000)+'c')` ran 25.4 s with a 10 ms budget; `3n ** 3000000n` ran 108 ms; the other attacks tried (regex backtracking, sort, `repeat`/`split`/`join`, `JSON.parse`, `replace`) were stopped in 12 to 44 ms. In the sim Worker one such script freezes the simulation, and nothing can end it short of reloading the page.
- QuickJS-WASM is unaudited upstream (`research/scripting.md`); a Worker does not make an escape impossible, but it separates the script's engine from the sim's state.

## Decision

**Each Run gets its own script Worker** (`script.worker.ts`, spawned by the sim Worker, terminated at the end of the run). The sim Worker never executes script code.

- Protocol (`script-protocol.ts`): sim to script `start { source, vessel, budgetMs, firstTickBudgetMs, env }` and `tick { snapshot }`; script to sim `ready`, `boot-failed`, `result { commands, status, error, elapsedMs, lines }`. The tick snapshot contains only the controlled vessel (the script cannot see others; the structured clone is smaller).
- Fan-out and back-pressure: one tick in flight. `sim-host` offers each sim tick's snapshot; if the previous one has not been answered the offer is dropped, so a slow script sees fewer snapshots and never builds a queue. Commands are dispatched when the result arrives, between sim ticks.
- Hard kill: `script-channel.ts` checks every sim tick (also while paused) that an unanswered tick is younger than `SCRIPT_WATCHDOG_MS` (500 ms) and that the Worker booted within 10 s; otherwise it calls `Worker.terminate()` and reports `terminated` (answer deadline) or `failed` (boot). The sim Worker does no script work, so a stuck script costs it a `postMessage` per tick and two clock reads.
- The runner is unchanged except for `firstTickBudgetMs` (default `budgetMs`): the web client gives the first, cold tick 200 ms and later ticks 10 ms, because on a loaded machine a harmless script's first tick overran 10 ms (journal 017; reproduced under load in plan 018 tests). The Worker backstop makes the larger first allowance safe.
- Untrusted return path: the sim Worker accepts from the script Worker only `throttle`, `attitude`, `stage` and `action` commands whose `vessel` is the script's vessel (the runner builds those; a compromised Worker could send anything). Other commands are dropped with a `! <type>: not allowed for scripts` log line; the rest still goes through `commandSchema` in the sim.

**Latency.** A script now acts on data that is at least one tick old and its commands land one or more ticks later (a Worker round trip, about 1 to 2 ms plus the script's own time). The sample's PD loop has a 0.5 rad/s bandwidth (time constant 2 s); a test delays every command by 3 ticks (60 ms of sim time) and the sample still reaches orbit (periapsis above 70 km, e below 0.1). Time warp is unchanged (the script sees fewer snapshots per sim second).

**Ship API.** `ship.engines` and `ship.wheels` (and `ship.parts[i].mass`) come from the part definitions in the environment the host already passes, not from module internals:

- an engine is any module whose definition config has numeric `thrust`, `ispVacuum`, `ispSeaLevel` > 0 (stock engine and mod engines with that shape); the entry carries those numbers plus `ignited`, `throttle`, `flameout` from the module snapshot;
- a wheel is a module whose config has numeric `torque` > 0 and whose snapshot has a boolean `enabled`.

Config is read as authored (defaults the module schema would add are not applied). Shape detection keeps `@orbital/scripting` free of stock ids (boundaries: stock is a mod). The sample ascent contains no thrust, Isp or torque literal; only standard gravity (the definition of Isp).

## Alternatives considered

- **Keep ADR 0022 and rely on the budget.** Rejected by the 25 s measurement above.
- **Sandboxed `iframe` (`sandbox` without `allow-same-origin`) hosting the script Worker**, to give the script an opaque origin with no IndexedDB, storage or same-origin `fetch`. Stronger against a WASM escape, but the page must then relay snapshots, the sim Worker's channel moves to the main thread (latency, frame-bound), and CSP for worker scripts can only be set by response headers of the worker script (MDN: workers are generally not governed by the creator's CSP, except `blob:`/`data:` workers), which a static build does not control. Not done; recorded in the draft follow-up as hardening to consider when hosting is chosen.
- **A generic `parts[i].config` of every module.** Exposes module internals of mods unreviewed; rejected for the typed `engines`/`wheels` views.
- **Worker per script kept alive across runs** (faster Run): rejected, a fresh Worker per run is the clean kill and costs a Worker plus WASM boot per Run.

## Consequences

- Cost: a second Worker bundle (the one `.wasm`, 503 KB, now loads in the script Worker; the sim Worker bundle no longer contains QuickJS), a structured clone of one vessel per tick, nested Workers (MDN documents sub-workers as part of the Workers API; verified here only in the Claude app's built-in browser, other browsers not tested; `research/scripting.md`).
- A runaway or wedged script can no longer delay a sim tick by more than a `postMessage`; terminating the script Worker leaves the sim running (tests with real threads).
- The residual risk is a WASM/JS-engine escape: the attacker would be in a Worker holding no sim state but with same-origin `fetch` and IndexedDB. Documented honestly in `docs/guides/scripting.md` and `architecture/scripting.md`; scripts are still code from strangers and the guide says so.
- `createSimHost({ createRunner })` is replaced by `spawnScriptWorker`.
