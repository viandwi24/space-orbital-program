# 015 — Scripting in the web client

**Plan:** plans/015-scripting-web-integration.md · **Session:** script-web session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The draft was refined to `ready` at the human's request (research in `research/scripting.md` and `research/web-client.md`), the runner placement was decided in ADR [0022](../decisions/0022-script-runner-in-the-sim-worker.md) (inside the sim Worker, not a second Worker), then implemented.

Scaffold: no generator applies; dependencies added with `bun add` in `apps/web`: `@orbital/scripting@workspace:*`, `@jitl/quickjs-wasmfile-release-sync@0.32.0`, `quickjs-emscripten-core@0.32.0`. `bun.lock` changed only by those entries. `.claude/launch.json` was not changed in the end (a temporary entry was used for the manual run and restored).

| Area | Files |
|---|---|
| host | `apps/web/src/lib/sim-host.ts` (runner ticked after `sim.step`, commands dispatched in-process, status/log posts, `SCRIPT_BUDGET_MS = 10`), `sim.worker.ts` (WASM from the bundled asset URL), `messages.ts` (`script-start`, `script-stop`, `script-status`, `script-log`) |
| page | `sim-client.ts` (`startScript`, `stopScript`, `onScript`), `script-state.ts` (pure reducer), `flight-loop.ts` (`runScript`, `stopScript`, keys ignored in text fields), `routes/flight/+page.svelte` (panel) |
| scripting | `createScriptRunnerIn(module, source, options)` in `runner.ts`; `createScriptRunner` moved to `default-module.ts`; `package.json` `sideEffects: false` and subpath exports `./runner`, `./samples/ascent` |
| tests | `sim-host-script.test.ts` (9, real runner and sim), `script-state.test.ts` (3), one more in `sim-client.test.ts`, one in `packages/scripting/test/api.test.ts` |

## Manual run (acceptance criterion `[manual]`)

Built-in browser, dev server on a temporary Vite config that ignores `packages/**` and `mods/**` for watching (a first attempt on the plain dev config was reset by an HMR reload when the parallel session edited a workspace package; the temporary config and the extra launch entry were deleted afterwards). Through the real UI: `/vab` Clear, Load two-stage example, Launch; `/flight`: Script, Load sample, Run. No autopilot, no key presses.

```
sample ascent from the panel (real time, 1x):  liftoff · staged at 76.7 s · cut: apoapsis 80003 m · circularise: dv 2006 m/s, t to apoapsis 20 s
T+03:49  periapsis 76.93 km, apoapsis 85.50 km, status "finished", log line "done: periapsis 76934 m"   (criterion: periapsis > 70 km)
tick cost in the panel during the ascent: last 0.4 to 0.8 ms, worst 3.9 to 6.3 ms (budget 10 ms)
runaway:  `print("looping"); while (true) {}`  -> status "terminated", "time budget exceeded (10 ms per tick)", last tick 10.4 ms,
          print output "looping" shown, HUD time kept advancing (T+03:49 to T+04:00 within seconds), page responsive
stop:     `for (;;) { await wait(1); print(...) }` -> Stop -> status "stopped", log ends at t 259 and no further lines
```

Screenshots (browser screenshots of the pane): `assets/015-script-running.png` (ascent mid-flight with log), `assets/015-script-orbit.png` (finished, 76.93 km periapsis), `assets/015-script-runaway-terminated.png`, `assets/015-script-stopped.png`. Browser console had no errors.

## Surprises

- **Bundling.** `import ... from 'quickjs-emscripten'` in a bundled app makes the build emit all four variants' `.wasm` (4.3 MB, three unused) because the bundler follows each variant's `new URL(..., import.meta.url)` before tree-shaking. Importing `getQuickJS` from the same module as `createScriptRunnerIn` had the same effect, so the runner was split: `createScriptRunnerIn` (module supplied by the host, no `quickjs-emscripten` import) vs `createScriptRunner` (`default-module.ts`), and the Worker imports the `@orbital/scripting/runner` subpath. Result: one 503 KB `.wasm` in `build/_app/immutable/workers/assets/`, none in the page chunks. ADR 0022 initially said "a `quickjs` option"; the shipped shape is the separate function (same idea, different surface).
- `?url` on a `.wasm` from a dependency's `exports` subpath (`@jitl/.../wasm`) works in Vite 8 dev and build in a module Worker; the default loader's own `new URL` inside the dependency was not tried in dev (the explicit URL was chosen up front).
- Typing in the panel would have flown the vessel (Space stages, WASD steers): the window key handler now returns early when focus is in a textarea/input.
- `form_input` on the textarea updates a Svelte `bind:value` correctly; `cmd+a` in the built-in browser did not select the textarea content (typed text landed mid-text), harmless for the runaway check.
- HUD "Stage 0 / 2 fired" does not count a script's `stage()`; the counter only sees page-sent commands. Filed in draft plan 017.
- A runaway script is cheap here: terminated on the first tick at 10.4 ms, the panel shows the budget message.

## Decisions

ADR 0022. Choices recorded here: refusals of script commands are logged once (`! stage: ...`) instead of per tick; status posts about twice a second while running carry `lastMs`/`maxMs`; a stop during runner boot discards the booting runner (epoch counter).

## Open questions / follow-ups

- Draft plan 017: script persistence, HUD stage counter, revisiting the second Worker when scripts become shareable.
- Time warp with a running script: not exercised; the runner ticks once per host tick, so under warp it sees fewer snapshots per sim second (`wait()` uses sim time).

## Verification output

```
bun run --filter @orbital/web test    7 files, 34 tests passed (21 before, 13 new)
bun test packages/scripting           23 pass, 0 fail
bun run typecheck                     all packages exit 0; svelte-check 0 errors, 0 warnings
bun run build                         Wrote site to "build"; one .wasm in build/_app/immutable/workers/assets
bun run docs:check                    OK (16 plans, 23 ADRs)
bun test (root)                       346 pass, 0 fail
bun run --filter @orbital/web lint    clean
Mutation: SCRIPT_BUDGET_MS 10 -> 400 makes the runaway host test fail (restored)
```
