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
| `ship.target`, `ship.targets` | the vessel's target and what it could aim at (plan 035, ADR 0065); `setTarget(spec)` chooses it (returns a verdict promise), `ship.sas` takes `'target'` and `'anti-target'`. |
| `bodies[id].state(t, frame)` | position and velocity of a body at simulation time `t` from its orbit. The runner has no `kepler` import (boundaries.md): the host passes a `bodyState` provider (the web client's script Worker builds it from `kepler.bodyStateAt`); without one the call throws. |
| `ship.throttle = x` | 0..1. Reading returns the last value set. |
| `ship.attitude = { pitch, yaw, roll }` | each -1..1, missing keys 0 (the `attitude` command). |
| `stage()` | the `stage` command; returns a promise of the host's verdict `{ ok, reason? }` (plan 032). |
| `action(part, module, action, ...args)` | the `action` command; `part` is a `ship.parts[i].id`; returns a promise of the verdict. |
| `warp(factor)` | the vessel-less `warp` command, 1 to `MAX_SCRIPT_WARP` (100 000); promise of the verdict. The host gates it (ADR 0039). |
| `bodies` | frozen map id -> `{ id, radius, mass, mu, rotationPeriod, atmosphere?, parent?, orbit? }` built from the `ScriptEnvironment`. |
| `ship.refusals` | `[{ command, reason }]` of the commands refused since the last tick (setters included). |
| `wait(s)` | promise resolved when simulation time has advanced by `s` (resolution is one tick). |
| `nextTick()`, `waitUntil(fn)` | resolve on the next `tick`; poll `fn` every tick. |
| `time()`, `print(...)` | simulation time; append a line to `runner.logs`. |

Invalid arguments throw inside the script (`RangeError`/`TypeError`), so a script sees a normal exception and nothing invalid is issued. A repeated `throttle`/`attitude` setpoint produces no new command. Commands are built from named fields with the vessel fixed by the runner and validated with core's `commandSchema`: a script cannot address another vessel or load vessels; `warp` is the one command without a vessel and the host decides (ADR 0039).

### Warp (plan 206, ADR 0202)

`warp(f)` and `warpTo(...)` name the script's vessel as the watched one, so the sim's limit is the vessel's: 10× in the air or under thrust, the rails tier of its altitude above it. A request above the limit is granted lower, never refused. `warpTo` takes a time or a target string, `'apoapsis'`, `'periapsis'`, `'soi'` or `'node'`, whose time the sim works out with its margin. The sim host holds a script's attitude (ADR 0039) only for rails levels; physics warp needs no rails.

### The debug API (plan 203, ADR 0200 point 9)

With `ScriptEnvironment.debug` true the prelude defines a frozen `debug` global: `setOrbit({ body?, apoapsis, periapsis } | { body?, a, e, i?, raan?, argp?, m0? })` (altitudes in m above the body's radius, angles in rad, the body defaulting to the current one), `setLocation(location)`, `setResource({ part?, resource?, fraction? | amount? })`, `setTemperature({ part?, temperature })`, `setCheat(cheat, on = true)` and `log(...)` (a `print` marked `[debug]`). Each issues the matching `debug-*` command for the script's own vessel and resolves with the verdict. The web sim host sets `debug` from `Snapshot.debug.allowed` when a Run starts; the sim refuses the commands anyway when the world does not allow them. `script-api.ts` lists the members in `DEBUG`, apart from `GLOBALS`.

### Engines and wheels (plan 018)

`ship.engines[]`: `{ part, module, thrust, ispVacuum, ispSeaLevel, ignited, throttle, flameout }` for every module whose **definition config** has numeric `thrust`, `ispVacuum`, `ispSeaLevel` above 0 (the stock engine and any mod engine of that shape; `thrust` is vacuum thrust at full throttle, N; Isp in s); the three state fields come from the module snapshot. `ship.wheels[]`: `{ part, module, torque, enabled }` for modules whose config has `torque` above 0 and whose snapshot has a boolean `enabled` (N·m per axis). `ship.parts[i].mass` is the dry mass from the part definition. The values are read from the `parts` of the `ScriptEnvironment` the host already passes, as authored (a default the module schema would add is not applied), so the package needs no stock ids and no module internals; an entry disappears with its part (staging). Arbitrary module configs are deliberately not exposed.

## Isolation and budget

- QuickJS is a separate engine instance; its global holds only ECMAScript built-ins plus the API above. `world`, `fetch`, `window`, `document`, `process`, `Bun`, `console`, timers do not exist; `Function('return this')()`, `constructor.constructor`, indirect `eval` only reach that same global. The host bridge (`cmd`, `print`, `done`) is captured in the prelude closure and not reachable. `Math.random` is a seeded PRNG. `Date` is replaced by a function over the **simulation** clock (`Date.now()` and `new Date()` are `floor(t * 1000)`; forms with arguments are the engine's own, `Date.prototype.constructor` points at the replacement so the native one is not reachable), so a replay is the same run.
- **Fuel (plan 032):** `fuelPolls` (option; the web client sets 20 000) counts the engine's interrupt-handler polls per tick (about one per 10 000 operations, about 100 per ms on an idle desktop); a tick with more is `terminated` ("work budget exceeded") at the same place on every machine. The wall budget below stays as the backstop (the polls do not bound native builtins either).
- **Budget:** `budgetMs` of wall time per `tick` covers the telemetry update, the script's synchronous part and all promise jobs (run in batches of 256 with a check between batches). QuickJS's interrupt handler is polled inside loops and calls; a script cannot catch the interrupt. The first overrun terminates the script and frees the runtime. Memory (16 MiB) and stack (256 KiB) are limited; heap exhaustion terminates, stack overflow is an ordinary script error.
- **Not preemptive across threads:** the runner executes on the caller's thread, so a runaway *loop* delays the host by about `budgetMs` once (measured: a 25 ms budget stops `while (true) {}` in 25 to 27 ms). **The budget is not a hard bound:** QuickJS polls the interrupt inside the interpreter, not inside native builtins; a long `indexOf` needle ran 25 s with a 10 ms budget (`research/scripting.md`, a test pins a 100 ms BigInt case). That is why the web client runs the runner in a Worker it can terminate (ADR 0031), see below. `firstTickBudgetMs` (default `budgetMs`) gives only the first, cold tick a larger budget. QuickJS-WASM is unaudited (upstream README), so treat the boundary as strong but not proven.

## In the web client (plan 015, amended by plan 018 / ADR 0031 and plan 030 / ADR 0038)

**Since plan 018 the runner no longer runs in the sim Worker** (ADR 0031 amends ADR 0022): `sim-host.ts` opens a `script-channel.ts` session per Run, which talks to the script Worker (`script.worker.ts` until plan 030; now `script-sandbox-worker.ts` inside the sandbox frame, below; QuickJS lives only there; `script-worker-core.ts` is its logic, `script-protocol.ts` the messages). After each `sim.step` the host offers the controlled vessel's snapshot; it is sent only when the previous tick was answered (otherwise dropped, no queue), the script Worker answers `result { commands, status, lines, elapsedMs }` and the host dispatches the commands on arrival, accepting only `throttle`/`attitude`/`stage`/`action` for the script's vessel. A tick unanswered for 500 ms (`SCRIPT_WATCHDOG_MS`) or a Worker that has not reported ready within 10 s gets `Worker.terminate()` and the status `terminated`/`failed`; the sim keeps ticking throughout. Commands therefore act on data one or more ticks old (the sample is tested with a 3-tick delay). The first tick may use 300 ms (`SCRIPT_FIRST_TICK_BUDGET_MS`), later ticks 200 ms (`SCRIPT_BUDGET_MS`; 10 ms and 200 ms until plan 030, raised because a wall-clock budget spiked past 10, 50 and 100 ms on a busy machine, see ADR 0038). The text below describes the page-facing messages, which did not change; where it says the runner is in the sim Worker, read: in the script Worker started by it.

`apps/web/src/lib/sim-host.ts` (before plan 018: owned the runner directly). Messages: `script-start { source, vessel, port? }` (the port to the sandbox, plan 030) / `script-stop` in; `script-status { status, error?, errorLine?, lastMs, maxMs }` (on every change, about twice a second while running) and `script-log { lines }` out. After each `sim.step` the host takes the snapshot, calls `runner.tick`, dispatches the commands with `sim.dispatch` (a refusal is logged once as `! <command>: <reason>`), and posts the snapshot; (plan 015 text; since plan 018 the runner is not on the sim's thread) a runaway script is `terminated` at the per-tick budget (`SCRIPT_BUDGET_MS`, 200 ms since plan 030); the panel shows the last and the worst tick time. `status` is the runner's plus `starting` and `stopped`. The WASM is loaded in the script Worker with `createScriptRunnerIn(await newQuickJSWASMModuleFromVariant(newVariant(releaseSync, { wasmBinary: <bytes the page fetched> })), ...)` (`script-sandbox-worker.ts`; `wasmLocation: <bundled asset URL>` until plan 030); `createScriptRunner` (shared `getQuickJS()` module) stays for Bun and tests. The flight view's panel (`routes/flight/+page.svelte`) has the editor, Run, Stop, Load sample (`ascentScript`), share/import, status, timing and the print log (plan 030, below); flight keys are ignored while a text field has focus. One script per Worker, controlling the vessel that was active at Run.

Plan 017 additions: the script text is saved per design name in `localStorage` (`orbital.script.<design name>`, `lib/storage.ts`; failures are silent, the text stays in the panel) and restored when `/flight` opens. The host forwards the sim's `stage:activated` events as a Worker message `{ kind: 'stage', vessel, stage }`; the HUD's "Stage x / y fired" is the highest `stage + 1` seen for the active vessel (`lib/stage-state.ts`), so a script's `stage()` is counted like a key press. The flight HUD shows a status (`landed` for `surface` rails, `orbit`, `suborbital`, `flight`; `lib/telemetry.ts`) and warp buttons enabled while the vessel is on rails.

### Command feedback and warp (plan 032, ADR 0039)

Every command the runner issues gets a sequence number (`TickResult.seqs`, parallel to `commands`; a repeated setpoint gets none). The script Worker's `result` carries `seqs`; the sim host dispatches, records `{ seq, ok, reason }` and sends the batch with the next `tick` (`verdicts`). The runner settles the guest promises of `stage()`/`action()`/`warp()` and fills `ship.refusals` when that tick starts, before `nextTick` waiters resume. `sim-host.ts` also owns the **warp hold**: while a script runs, a `warp` above 1 (from the page or from `warp()`) zeroes the vessel's attitude, holds back the script's non-zero attitude, retries the sim's `warp` every tick until the vessel is on rails (8 s wall limit, then the sim's own reason), and releases the hold, re-sending the last held attitude, on `warp 1` or when the script ends. The HUD's warp buttons are enabled while a script runs (`canWarp(..., scriptRunning)`).

### The sandbox frame (plan 030, ADR 0038)

Since plan 030 the script Worker is not spawned by the sim Worker any more. Per Run the page (`script-sandbox.ts`, wired to the DOM in `script-sandbox-web.ts`, driven by `flight-loop.ts`):

1. creates `<iframe sandbox="allow-scripts">` (never `allow-same-origin`) with `srcdoc` built from `static/sandbox/script-sandbox.html` and the bundled bootstrap (`script-sandbox-document.ts`); the document's `<meta>` CSP is `default-src 'none'; script-src 'sha256-<bootstrap>' 'wasm-unsafe-eval'; worker-src blob:; connect-src 'none'` and `'none'` for every other fetch directive;
2. makes a `MessageChannel`, posts the iframe the Worker's script text (the bundle `static/sandbox/script-sandbox-worker.js`, built by `apps/web/scripts/build-sandbox.ts` before `dev` and `build`), a copy of the QuickJS `.wasm` bytes and `port2`; the iframe (`script-sandbox-frame.ts`; it refuses to run unless `window.origin` is `"null"`) creates the Worker from a blob (which inherits the opaque origin and the CSP) and transfers port and bytes to it;
3. sends `port1` to the sim Worker with `script-start`; `script-port.ts` makes it a `ScriptWorkerLike`, so `script-channel.ts` (watchdog, boot timeout, command filter) is unchanged and ticks travel sim Worker <-> script Worker without the main thread;
4. removes the iframe when the script's status leaves `starting`/`running`, on Stop and on dispose. Removing the iframe is the hard kill of a Worker stuck in a native builtin.

`script-sandbox-probe.ts` runs in the iframe document and in the Worker and reports what is reachable (same-origin `fetch`, IndexedDB, localStorage, cookies, Cache storage); the panel shows it ("Runs isolated" only when both contexts reported nothing reachable). Cookies and Cache storage are tested against a **sentinel** the page plants in the game origin first (plan 032): an API that works but sees none of the page's data is `isolated` (WebKit answers `document.cookie` with "" and `caches` with an empty store in an opaque origin instead of throwing); one that sees it is `reachable`. The script Worker's bundle sets zod to `jitless` first (`script-sandbox-jitless.ts`), because zod's probe `new Function('')` is a CSP violation Firefox logs as an error. What an escaped script can still do is in ADR 0038.

### The syntax check before Run (plan 058, ADR 0085)

The editor asks the engine whether the script compiles, without running it. `checkScriptSyntax` (`@orbital/scripting/syntax`) wraps the source as the runner does and evaluates it with QuickJS `compileOnly` in a throw-away runtime; it answers `{ ok }` or the engine's message with the line and column of the player's source (an error at the end of the input is put on the last line, in the runner's `errorLine` too). The page keeps a **second** `ScriptSandbox` for it (`routes/flight/+page.svelte` creates it next to the Run's; `script-checker.ts` wraps it): opened on the first check, closed after 30 s idle, when the script panel closes and on dispose; a failed start is not retried for 10 s. The checker uses the port `open()` returns itself and sends only `check { id, source }` (parsed by `parseToScriptWorker`, source at most 200 000 characters); the Worker answers `checked { id, ok, message?, line?, column? }` (`script-worker-core.ts` handles it without a runner; the Worker builds a QuickJS module on the first check and keeps it). The port never goes to the sim Worker. The editor debounces 500 ms, shows only the answer for the text still in the editor and never blocks Run.

**Hosting requirements for plan 023.** None for the sandbox on a static host. If a CSP is set on the game page: allow the `srcdoc` iframe (`frame-src about:` / `child-src`), allow the bootstrap's hash in the page's `script-src` (a `srcdoc` document inherits the parent's policy as well as its own: `'sha256-<hash of static/sandbox/script-sandbox-frame-main.js>'`; the hash changes with the bundle, compute it at build time), `worker-src 'self' blob:` for the sim Worker and `connect-src 'self'`; no CORS headers are needed (the page fetches the bundles itself). A failing policy shows as "the script sandbox did not start" and no script runs. Optional headers: `X-Content-Type-Options: nosniff`, a strict `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`. The fallback `static/sandbox/script-sandbox.html` can be served with `Content-Security-Policy: sandbox allow-scripts` but is not loaded by `src` today (a `src` iframe was blocked in the verification browser).

### Panel features (plan 030)

`hud/ScriptPanel.svelte` with `hud/CodeEditor.svelte` (a textarea over a painted layer: `script-highlight.ts` tokenizer, line numbers, error-line band; colours are `--syn-*` tokens in `ui/tokens.css`, contrast-tested). Errors: `runner.errorLine` (1-based script line, from the first `script.js` stack frame minus the two wrapper lines; frames in `error` are rewritten to `line N:col`) travels `result` -> `script-status.errorLine` -> `ScriptView.errorLine`; the route shows the marker only while the editor still holds the text that ran. Share and import (`script-share.ts`): text, `#script=v1.<base64url deflate-raw>` links (read on load and on `hashchange`, 64 KB cap before and after decompression), `.orbital.js` files; imported text is flagged until the player confirms a Run.

## Sample

`ascentScript` (`src/samples/ascent.ts`) is the plan 007 ascent as a script: gravity turn, stage on flameout, cut at an 80 km apoapsis, coast, circularise to a 76 km periapsis, PD attitude loop from `ship.orientation`. `test/ascent.test.ts` flies it headlessly; see the journal for the orbit it reaches. The sample reads wheel torque and engine thrust/Isp from `ship.wheels` and `ship.engines`; its only physical constant is standard gravity.

## Known limits

Scripts are JavaScript, not TypeScript; one script per vessel per runner; the editor has no completion or auto-indent (Tab still moves focus); telemetry only covers the controlled vessel; no target or maneuver data (the sim has neither, draft plan 035).
