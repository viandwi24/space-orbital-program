# 010 — Scripting sandbox

**Plan:** plans/010-scripting-sandbox.md · **Session:** scripting session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The draft was refined to `ready` at the human's request, then implemented. Runtime research and the ADR came first: Worker with a restricted global vs QuickJS-WASM vs ShadowRealm (`research/scripting.md`), decision in ADR [0020](../decisions/0020-scripting-runtime-quickjs-wasm.md): QuickJS-WASM with an interrupt-handler budget per tick.

Scaffold commands:

```sh
mkdir packages/scripting && cd packages/scripting && bun init --yes   # then: index.ts -> src/, rewrote package.json and tsconfig.json like the other packages
bun add --cwd packages/scripting quickjs-emscripten                    # 0.32.0
bun add -d --cwd packages/scripting '@orbital/sim@workspace:*' '@orbital/physics@workspace:*' '@orbital/mod-stock@workspace:*' '@orbital/sdk@workspace:*'   # tests only
```

`bun init` also generated `CLAUDE.md`, `README.md`, `.gitignore`; removed (the repo's own docs cover it). `bun.lock` changed only by this package (checked with `git diff bun.lock` before staging).

| Area | Files |
|---|---|
| runner | `src/runner.ts` (limits, interrupt budget, job pump, command validation, status), `src/prelude.ts` (guest API; host bridge captured in a closure), `src/telemetry.ts` (snapshot to `Telemetry`) |
| sample | `src/samples/ascent.ts` |
| tests | `test/{budget,api,sandbox,ascent}.test.ts`, `test/helpers.ts` |
| docs | ADR 0020, `research/scripting.md`, `architecture/scripting.md`, `boundaries.md` row, AGENTS.md map, glossary, `stack-versions.md`, `overview.md`, draft plan 015 |

## Results

```
bun test packages/scripting  -> 22 pass, 0 fail, 65 expects, 2.7 s
script orbit: apoapsis 111.88 km, periapsis 76.24 km, e 0.0257, sim time 217.5 s, 10677 ticks, max tick 2-3 ms (Date.now resolution), wall 0.7 s
  liftoff / staged at 60.8 s / cut: apoapsis 80032 m / circularise: dv 2020 m/s, t to apoapsis 20 s / done: periapsis 76244 m
infinite loop (budget 25 ms): terminated on the first tick, elapsed 25-27 ms; 100 sim steps afterwards advance exactly 2 s
```

The script ascent matches the TypeScript helper's result (plan 007: 76.11 km periapsis, e 0.043; here 76.24 km, e 0.026; the sim has since changed with plans 011/012).

## What surprised me

- The interrupt handler cannot be swallowed by `try/catch` in the guest (tested), and it fires inside microtask-only loops too. Still, `executePendingJobs` runs a whole queue in one call, so the runner pumps in batches of 256 and checks the deadline between them.
- A guest error that reaches the promise `.then` handler (memory exhaustion in an async function) arrives as an ordinary rejection, not as an error result of the call, so the first version reported memory exhaustion as `failed`. The prelude now passes `name`, `message` and `stack` separately and the host classifies in one place (`settle`).
- Disposing a QuickJS runtime with live handles aborts the process; every handle the runner keeps is tracked and disposed first.
- The root part is the pod at the top of the stack, so the on-pad `ship.altitude` is about 7.5 m, not 0.
- `Date.now` has 1 ms resolution, so `elapsedMs` is coarse; the budget is wall time by design and the clock is injectable (`now`).
- No `timeout` binary on macOS; a hanging mutation test was killed with `perl -e 'alarm 15; exec @ARGV'`.

## Mutation checks

- Sandbox: putting `globalThis.fetch` and `globalThis.world` into the prelude makes 4 of 5 sandbox tests fail (restored).
- Budget: replacing the interrupt handler with `() => false` makes the infinite-loop test hang (killed after 15 s; restored).

## Decisions made

ADR 0020. Deviations from the refined plan: none. Wiring into `apps/web` and running the runner in a Worker are out of scope and filed as draft plan 015.

## Open questions / follow-ups

- Plan 015: Worker hosting, Vite bundling of the WASM, script panel.
- Telemetry does not expose module configs (reaction wheel torque, engine thrust and Isp), so the sample hardcodes them; a later API could expose `ship.engines` or similar.
- `Date` inside the guest still reads the host clock; Math.random is seeded. Hide `Date` if determinism of scripts is ever required for replays.
- A same-thread budget means a runaway script costs the host up to `budgetMs` once; the Worker arrangement removes even that.

## Verification output

```
bun test packages/scripting   22 pass, 0 fail
bun run typecheck             all packages exit 0 (incl. @orbital/scripting); svelte-check 0 errors
bun run build                 Wrote site to "build"
bun run docs:check            OK (15 plans, 20 ADRs)
bun test (root)               317 tests: 315 pass on the first run (2 failures from another session's in-flight work), 0 fail on the rerun
bunx prettier --check packages/scripting docs   clean
```
