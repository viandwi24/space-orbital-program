# Scripting

`@orbital/scripting` runs untrusted player scripts against a small `ship` API. Shipped by plan 010; the runtime choice and its security reasoning are in ADR 0020, the options that were checked in `research/scripting.md`. Code: `packages/scripting/src` (`runner.ts`, `telemetry.ts`, `prelude.ts`, `samples/ascent.ts`).

## Shape

```ts
const runner = await createScriptRunner(source, {
  vessel,                          // the one vessel the script controls (entity id number)
  bodies: sim.registries.bodies.list(), parts: sim.registries.parts.list(), resources: sim.registries.resources.list(),
  budgetMs: 10, memoryLimitBytes: 16 * 1024 * 1024, maxStackBytes: 256 * 1024, seed: 1,
  now: Date.now,                   // clock for the budget only; onPrint for print() lines
});
// every host tick:
sim.step(dt);
const { commands, status, elapsedMs } = runner.tick(sim.snapshot());
for (const c of commands) sim.dispatch(c);       // or post to the sim Worker
```

The runner is a function of snapshots: it never holds the sim, so untrusted code never runs inside `step`, and an async dispatch round trip (the web client's `SimClient`) works unchanged. `source` is the body of an async function, so top-level `await` works. `runner.status` is `running | finished | failed | terminated`; `error` says why; `logs` holds `print()` output. A script is a one-shot: after `finished`, `failed` or `terminated` the host creates a new runner.

## Script API (globals inside the sandbox)

| Name | Meaning |
|---|---|
| `ship.<telemetry>` (read-only) | `t`, `mode`, `body`, `bodyRadius`, `mu`, `position`, `velocity`, `altitude`, `speed`, `up`, `orientation` (quaternion), `nose` (+Y axis in BCI), `mass`, `inertia`, `orbit` (elements or `null`), `apoapsis`, `periapsis`, `eccentricity` (altitudes in m, `null` without an orbit), `parts[]` (`id`, `definition`, `position`, `mass`, `modules` state), `engines[]` and `wheels[]` (constants from the part definitions, below). SI, BCI axes. Fresh copy each tick. |
| `ship.throttle = x` | 0..1. Reading returns the last value set. |
| `ship.attitude = { pitch, yaw, roll }` | each -1..1, missing keys 0 (the `attitude` command). |
| `stage()` | the `stage` command. |
| `action(part, module, action, ...args)` | the `action` command; `part` is a `ship.parts[i].id`. |
| `wait(s)` | promise resolved when simulation time has advanced by `s` (resolution is one tick). |
| `nextTick()`, `waitUntil(fn)` | resolve on the next `tick`; poll `fn` every tick. |
| `time()`, `print(...)` | simulation time; append a line to `runner.logs`. |

Invalid arguments throw inside the script (`RangeError`/`TypeError`), so a script sees a normal exception and nothing invalid is issued. A repeated `throttle`/`attitude` setpoint produces no new command. Commands are built from named fields with the vessel fixed by the runner and validated with core's `commandSchema`: a script cannot address another vessel, warp, or load vessels.

### Engines and wheels (plan 018)

`ship.engines[]`: `{ part, module, thrust, ispVacuum, ispSeaLevel, ignited, throttle, flameout }` for every module whose **definition config** has numeric `thrust`, `ispVacuum`, `ispSeaLevel` above 0 (the stock engine and any mod engine of that shape; `thrust` is vacuum thrust at full throttle, N; Isp in s); the three state fields come from the module snapshot. `ship.wheels[]`: `{ part, module, torque, enabled }` for modules whose config has `torque` above 0 and whose snapshot has a boolean `enabled` (N·m per axis). `ship.parts[i].mass` is the dry mass from the part definition. The values are read from the `parts` of the `ScriptEnvironment` the host already passes, as authored (a default the module schema would add is not applied), so the package needs no stock ids and no module internals; an entry disappears with its part (staging). Arbitrary module configs are deliberately not exposed.

## Isolation and budget

- QuickJS is a separate engine instance; its global holds only ECMAScript built-ins plus the API above. `world`, `fetch`, `window`, `document`, `process`, `Bun`, `console`, timers do not exist; `Function('return this')()`, `constructor.constructor`, indirect `eval` only reach that same global. The host bridge (`cmd`, `print`, `done`) is captured in the prelude closure and not reachable. `Math.random` is a seeded PRNG. `Date` is still QuickJS's and reads the host clock (not hidden; out of scope).
- **Budget:** `budgetMs` of wall time per `tick` covers the telemetry update, the script's synchronous part and all promise jobs (run in batches of 256 with a check between batches). QuickJS's interrupt handler is polled inside loops and calls; a script cannot catch the interrupt. The first overrun terminates the script and frees the runtime. Memory (16 MiB) and stack (256 KiB) are limited; heap exhaustion terminates, stack overflow is an ordinary script error.
- **Not preemptive across threads:** the runner executes on the caller's thread, so a runaway *loop* delays the host by about `budgetMs` once (measured: a 25 ms budget stops `while (true) {}` in 25 to 27 ms). **The budget is not a hard bound:** QuickJS polls the interrupt inside the interpreter, not inside native builtins; a long `indexOf` needle ran 25 s with a 10 ms budget (`research/scripting.md`, a test pins a 100 ms BigInt case). That is why the web client runs the runner in a Worker it can terminate (ADR 0031), see below. `firstTickBudgetMs` (default `budgetMs`) gives only the first, cold tick a larger budget. QuickJS-WASM is unaudited (upstream README), so treat the boundary as strong but not proven.

## In the web client (plan 015, amended by plan 018 / ADR 0031)

**Since plan 018 the runner no longer runs in the sim Worker** (ADR 0031 amends ADR 0022): `sim-host.ts` opens a `script-channel.ts` session per Run, which spawns `script.worker.ts` (QuickJS lives only there; `script-worker-core.ts` is its logic, `script-protocol.ts` the messages). After each `sim.step` the host offers the controlled vessel's snapshot; it is sent only when the previous tick was answered (otherwise dropped, no queue), the script Worker answers `result { commands, status, lines, elapsedMs }` and the host dispatches the commands on arrival, accepting only `throttle`/`attitude`/`stage`/`action` for the script's vessel. A tick unanswered for 500 ms (`SCRIPT_WATCHDOG_MS`) or a Worker that has not reported ready within 10 s gets `Worker.terminate()` and the status `terminated`/`failed`; the sim keeps ticking throughout. Commands therefore act on data one or more ticks old (the sample is tested with a 3-tick delay). The first tick may use 200 ms (`SCRIPT_FIRST_TICK_BUDGET_MS`), later ticks 10 ms. The text below describes the page-facing messages, which did not change; where it says the runner is in the sim Worker, read: in the script Worker started by it.

`apps/web/src/lib/sim-host.ts` (before plan 018: owned the runner directly). Messages: `script-start { source, vessel }` / `script-stop` in; `script-status { status, error?, lastMs, maxMs }` (on every change, about twice a second while running) and `script-log { lines }` out. After each `sim.step` the host takes the snapshot, calls `runner.tick`, dispatches the commands with `sim.dispatch` (a refusal is logged once as `! <command>: <reason>`), and posts the snapshot; a runaway script therefore delays one sim tick by at most the 10 ms budget (`SCRIPT_BUDGET_MS`) and is then `terminated`, while a healthy one adds its per-tick work to every tick (the panel shows last and worst tick time). `status` is the runner's plus `starting` and `stopped`. The WASM is loaded in the Worker with `createScriptRunnerIn(await newQuickJSWASMModuleFromVariant(newVariant(releaseSync, { wasmLocation: <bundled asset URL> })), ...)` (`sim.worker.ts`); `createScriptRunner` (shared `getQuickJS()` module) stays for Bun and tests. The flight view's panel (`routes/flight/+page.svelte`) has a textarea, Run, Stop, Load sample (`ascentScript`), status, timing and the print log; flight keys are ignored while a text field has focus. One script per Worker, controlling the vessel that was active at Run.

Plan 017 additions: the script text is saved per design name in `localStorage` (`orbital.script.<design name>`, `lib/storage.ts`; failures are silent, the text stays in the panel) and restored when `/flight` opens. The host forwards the sim's `stage:activated` events as a Worker message `{ kind: 'stage', vessel, stage }`; the HUD's "Stage x / y fired" is the highest `stage + 1` seen for the active vessel (`lib/stage-state.ts`), so a script's `stage()` is counted like a key press. The flight HUD shows a status (`landed` for `surface` rails, `orbit`, `suborbital`, `flight`; `lib/telemetry.ts`) and warp buttons enabled while the vessel is on rails.

## Sample

`ascentScript` (`src/samples/ascent.ts`) is the plan 007 ascent as a script: gravity turn, stage on flameout, cut at an 80 km apoapsis, coast, circularise to a 76 km periapsis, PD attitude loop from `ship.orientation`. `test/ascent.test.ts` flies it headlessly; see the journal for the orbit it reaches. The sample reads wheel torque and engine thrust/Isp from `ship.wheels` and `ship.engines`; its only physical constant is standard gravity.

## Known limits

Scripts are JavaScript, not TypeScript; one script per vessel per runner; no persistence or editor beyond a plain textarea; refusals by the sim (e.g. `stage` with no stage left) are visible only to the host that dispatches, not to the script; telemetry only covers the controlled vessel.
