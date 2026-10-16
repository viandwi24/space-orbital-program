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
| `ship.<telemetry>` (read-only) | `t`, `mode`, `body`, `bodyRadius`, `mu`, `position`, `velocity`, `altitude`, `speed`, `up`, `orientation` (quaternion), `nose` (+Y axis in BCI), `mass`, `inertia`, `orbit` (elements or `null`), `apoapsis`, `periapsis`, `eccentricity` (altitudes in m, `null` without an orbit), `parts[]` (`id`, `definition`, `position`, `modules` state). SI, BCI axes. Fresh copy each tick. |
| `ship.throttle = x` | 0..1. Reading returns the last value set. |
| `ship.attitude = { pitch, yaw, roll }` | each -1..1, missing keys 0 (the `attitude` command). |
| `stage()` | the `stage` command. |
| `action(part, module, action, ...args)` | the `action` command; `part` is a `ship.parts[i].id`. |
| `wait(s)` | promise resolved when simulation time has advanced by `s` (resolution is one tick). |
| `nextTick()`, `waitUntil(fn)` | resolve on the next `tick`; poll `fn` every tick. |
| `time()`, `print(...)` | simulation time; append a line to `runner.logs`. |

Invalid arguments throw inside the script (`RangeError`/`TypeError`), so a script sees a normal exception and nothing invalid is issued. A repeated `throttle`/`attitude` setpoint produces no new command. Commands are built from named fields with the vessel fixed by the runner and validated with core's `commandSchema`: a script cannot address another vessel, warp, or load vessels.

## Isolation and budget

- QuickJS is a separate engine instance; its global holds only ECMAScript built-ins plus the API above. `world`, `fetch`, `window`, `document`, `process`, `Bun`, `console`, timers do not exist; `Function('return this')()`, `constructor.constructor`, indirect `eval` only reach that same global. The host bridge (`cmd`, `print`, `done`) is captured in the prelude closure and not reachable. `Math.random` is a seeded PRNG. `Date` is still QuickJS's and reads the host clock (not hidden; out of scope).
- **Budget:** `budgetMs` of wall time per `tick` covers the telemetry update, the script's synchronous part and all promise jobs (run in batches of 256 with a check between batches). QuickJS's interrupt handler is polled inside loops and calls; a script cannot catch the interrupt. The first overrun terminates the script and frees the runtime. Memory (16 MiB) and stack (256 KiB) are limited; heap exhaustion terminates, stack overflow is an ordinary script error.
- **Not preemptive across threads:** the runner executes on the caller's thread, so a runaway script delays the host by at most `budgetMs` once (measured: a 25 ms budget stops `while (true) {}` in 25 to 27 ms). In the web client the runner should live in the sim Worker or its own Worker (follow-up plan); QuickJS-WASM is unaudited (upstream README), so treat the boundary as strong but not proven.

## Sample

`ascentScript` (`src/samples/ascent.ts`) is the plan 007 ascent as a script: gravity turn, stage on flameout, cut at an 80 km apoapsis, coast, circularise to a 76 km periapsis, PD attitude loop from `ship.orientation`. `test/ascent.test.ts` flies it headlessly; see the journal for the orbit it reaches. Engine and reaction wheel constants are literals in the script (telemetry does not expose module configs).

## Known limits

Scripts are JavaScript, not TypeScript; one script per vessel per runner; no persistence or editor; refusals by the sim (e.g. `stage` with no stage left) are visible only to the host that dispatches, not to the script; telemetry only covers the controlled vessel.
