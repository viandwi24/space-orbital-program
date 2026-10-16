# 018 — Script sharing container and ship API constants

**Plan:** plans/018-script-sharing-and-ship-api.md · **Session:** script-api session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The draft was refined to `ready` at the human's request (Worker/CSP/advisory research in `research/scripting.md`), then implemented. ADR [0031](../decisions/0031-script-runner-in-its-own-worker.md) moves the runner out of the sim Worker into a per-Run script Worker and amends ADR 0022; no scaffolding, no new dependencies.

| Area | Files |
|---|---|
| ship API | `packages/scripting/src/telemetry.ts` (`engines`, `wheels`, `parts[i].mass`, by config shape), `index.ts` types, `samples/ascent.ts` (no stock constants), `runner.ts` (`firstTickBudgetMs`) |
| script Worker | `apps/web/src/lib/script-protocol.ts`, `script-worker-core.ts` (logic + in-process double), `script.worker.ts` (entry, QuickJS and the `.wasm` live here now), `script-channel.ts` (session, watchdog, boot deadline) |
| host | `sim-host.ts` (`spawnScriptWorker` replaces `createRunner`; command filter; budget overrides for tests), `sim.worker.ts` (no QuickJS any more) |
| tests | `packages/scripting/test/{api,ascent,budget,sandbox,helpers}.test.ts`; `apps/web/src/lib/sim-host-script-worker.test.ts` (real `worker_threads`), `script-worker-node.fixture.ts`, `sim-host-script.test.ts` |
| docs | ADR 0031, `guides/scripting.md` (new, player reference), `architecture/scripting.md`, `research/scripting.md`, draft plan 030 |

## The measurement that decided the ADR

With a 10 ms budget one tick of a script: `indexOf` of a 5000-char needle in a 10 MB string ran **25.4 s** (a native builtin never polls the interrupt); `3n ** 3000000n` 108 ms; BigInt modular squaring 73 ms; `repeat/split/join` 44 ms; regex backtracking, `sort` of millions, `JSON.parse` loops, `replace`: 12 to 13 ms (stopped). So the same-thread budget of ADR 0020 does not bound a hostile script, and in the sim Worker one `indexOf` freezes the simulation until the page is reloaded. Shared scripts are hostile input, hence a Worker that can be terminated.

## Results

```
bun test packages/scripting     28 pass, 0 fail   (was 22 before plan 018 + tests for engines/wheels, delayed ascent, first-tick budget, native overrun)
script orbit (sample, no constants): apoapsis 111.88 km, periapsis 76.24 km, e 0.0257 (identical to plan 010)
same ascent with every command 3 ticks (60 ms) late: periapsis > 70 km, e < 0.1 (test)
bun run --filter @orbital/web test   24 files, 201 tests pass
bun test (root)                 692 pass, 0 fail
bun run typecheck               all packages exit 0; svelte-check 0 errors, 0 warnings
bun run build                   Wrote site; one .wasm (491 KB) in build/_app/immutable/workers/assets, bundled by script.worker
bun run docs:check              OK
```

Real-thread tests (`node:worker_threads`, `--experimental-transform-types` because workspace packages use TypeScript parameter properties): a QuickJS thread runs a script end to end; a thread that wedges inside a tick is terminated by the watchdog (150 ms in the test, 500 ms shipped), the thread exits, and the sim keeps ticking; a thread that never boots is failed after the boot timeout; the `indexOf` attack (3 s in a native call) is ended by `terminate()` while sim ticks stay under the calibrated bound; a hostile worker's `load-vessel` and other-vessel commands are dropped (`! load-vessel: not allowed for scripts`).

Mutations: disabling the watchdog fails the wedged and `indexOf` tests; letting every command through fails the hostile-commands test; replacing the QuickJS interrupt handler by `() => false` makes `test/budget` hang (killed by a 60 s alarm; a synchronous WASM loop cannot be interrupted by a test timeout).

## Flaky timing tests (coordinator request, found during execution)

Cause: wall-clock assertions that the machine load can break (`iterations < 25 ms`, `maxTick < 10 ms`, a memory-exhaustion test that was ended by a 2 s budget instead of the memory limit, a cold first tick over 10 ms, 201 ms against 50 ms in the sim-host test after the first-tick allowance). Fixes are in the plan Log. Reproduction and results (6 parallel loops of `bun test packages/scripting`, 3 runs each = 18 runs, plus 10 sequential; 12 parallel `vitest` processes of the sim-host script files, 4 rounds = 48 runs, plus 10 sequential):

```
before: parallel bun test  18 of 18 runs failed the memory test (7 to 8 s under load vs a 5 s default test timeout, then 2.1 s vs a 2 s bound)
after:  sequential x10   28 pass 0 fail (10 of 10)
        parallel 6 x 3   28 pass 0 fail (18 of 18)
        vitest sequential x10   15 pass (10 of 10); parallel 12 x 4: 15 pass (48 of 48)
        (vitest, first tries: terminated first-tick scripts at 10 ms/200 ms and a 68 ms tick against a 50 ms bound failed 1 to 8 of 8 under load; fixed by the 5 s plumbing budgets and the calibrated bound)
```

## Manual run (partial)

Built-in browser, dev server `script-dev` (own launch entry, removed afterwards). Through the UI: `/vab` Load two-stage example, Launch; `/flight`: Script, Load sample, Run. The script ran in the nested script Worker: status running, `liftoff`, `staged at 70.5 s`, `cut: apoapsis 80083 m` at T+1:29, last tick 0.2 ms, worst 3.5 to 4.2 ms. After that the Vite dev server reloaded the page repeatedly (other sessions editing packages; a temporary config that ignores `packages/**` fixed that), and the shared Browser pane was then hidden by the user, so the page stopped rendering and the sim never started in later attempts. The orbit run and a browser runaway script were not completed. The pane was left as found; my tabs are closed.

## Surprises

- Node's type stripping cannot load the workspace packages (parameter properties in `core`): the real-thread tests start the Worker with `--experimental-transform-types`.
- The cold first tick overran the 10 ms budget for a trivial script under load (journal 017 predicted it); reproduced 5 of 6 times with six parallel vitest processes. `firstTickBudgetMs` (200 ms in the web client) fixes it and is only safe because the Worker can be killed.
- `Worker.onmessage` typing differs between DOM `Worker` and the slice the channel uses; `sim.worker.ts` adapts it the way `startSimWorker` does.
- The scripting package's own memory-exhaustion test takes about 1 s solo (QuickJS near its limit); it had a 5 s default timeout that machine load exceeded.

## Open questions / follow-ups

- Draft plan 030: hosting-level CSP for the script Worker, sandboxed-iframe containment, Safari/Firefox nested Workers, share/import UI, API additions.
- Plan 023 should repeat the browser run to orbit and a native-builtin runaway by hand, and may restyle the panel; it should keep the 100-500 ms status wording (`terminated: script stopped responding ...`) in mind for the panel, which shows `error` verbatim.
