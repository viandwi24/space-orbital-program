---
id: 015
title: Scripting in the web client
status: in-progress
owner: "script-web session (Claude, 2026-10-16)"
depends: [010]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 015 — Scripting in the web client

## Goal

A player can paste a script in the web client, run it against the active vessel, see its `print` output and status, and stop it. The runner from plan 010 runs off the main thread (inside the sim Worker), so a slow script cannot cost frames and a runaway script is stopped within the documented budget.

## Context

- ADR [0020](../decisions/0020-scripting-runtime-quickjs-wasm.md) and [`architecture/scripting.md`](../architecture/scripting.md) (runner contract, budget semantics, unaudited-WASM note); ADR [0022](../decisions/0022-script-runner-in-the-sim-worker.md) (decision made by this plan: runner inside the sim Worker).
- `apps/web/src/lib/{messages,sim-host,sim-client,sim.worker,flight-loop}.ts`, `routes/flight/+page.svelte`; `packages/scripting/src/runner.ts`.
- Research: [`research/scripting.md`](../research/scripting.md) (QuickJS bundling), [`research/web-client.md`](../research/web-client.md) (Vite workers, Svelte 5).
- Journals 009 (manual-run method, Vite reload caveat) and 010.

## Scope

**In:** host wiring (messages `script-start` / `script-stop` in, `script-status` / `script-log` out), the WASM loaded through a bundled asset URL, a minimal script panel in the flight view (textarea, Run, Stop, Load sample, status, log), `ascentScript` as the template, vitest tests with a mocked Worker, one additive option in `@orbital/scripting` (`quickjs` module injection).
**Out:** editor polish (highlighting, completion), persistence, sharing, TypeScript scripts, a second Worker for the runner (ADR 0022 records why not now), per-script permissions.

## Design notes

- Protocol (plain data): client to worker `{ kind: 'script-start', source, vessel }`, `{ kind: 'script-stop' }`; worker to client `{ kind: 'script-status', status: 'starting' | ScriptStatus | 'stopped', error?, lastMs, maxMs }` (on every change and about twice a second while running) and `{ kind: 'script-log', lines }` (print output and sim refusals, at most one message per tick).
- `sim-host.ts` takes an injectable `createRunner` (default wired in `sim.worker.ts`); after `sim.step` it takes `sim.snapshot()`, ticks the runner, dispatches commands with `sim.dispatch`, posts the snapshot. Runner failures that are not the script's (vessel gone) end the script as `failed`.
- The page keeps script state in a small pure reducer (`script-state.ts`) and flight keys are ignored while a text field has focus.

## Steps

1. Research and decision: Vite + WASM + Worker loading, ADR 0022 (done in refinement, recorded in the Log).
2. `@orbital/scripting`: optional `quickjs` module in `ScriptRunnerOptions`; `"sideEffects": false`. Web dependencies: `@orbital/scripting`, `@jitl/quickjs-wasmfile-release-sync`, `quickjs-emscripten`.
3. Protocol, host, worker wiring, client API (`startScript`, `stopScript`, `onScript`), tests.
4. Script panel in `/flight`, state reducer, keyboard guard.
5. `[manual]` run in the browser; journal with screenshots; docs.

## Acceptance criteria

- [ ] `bun run --filter @orbital/web test` passes, including new host tests (mocked Worker, same pattern as `sim-host.test.ts`): `script-start` creates a runner and posts `starting`/`running` status; commands issued by a script reach the sim (a `throttle` command changes the vessel's throttle in the next snapshot); `print` lines arrive as `script-log`; `script-stop` ends it and posts `stopped`; and a runaway script (`while (true) {}`, budget 25 ms) is reported `terminated` while the tick that ran it takes less than 5x the budget in wall time and the following ticks keep posting snapshots that advance sim time. Client and reducer tests for the new messages.
- [ ] `bun test packages/scripting` still passes (22 tests, plus one for the injected module).
- [ ] `bun run build` passes with the WASM bundled as an asset (`build/_app/immutable/assets/*.wasm` exists) and QuickJS only in the Worker chunk, not the page chunks.
- [ ] `bun run typecheck` and `bun run docs:check` pass; `bun run --filter @orbital/web lint` is clean.
- [ ] `[manual]` in the browser: from the `/flight` script panel, "Load sample" + Run flies the sample ascent to a periapsis above 70 km, `print` output appears in the panel, Stop ends a running script, and an infinite-loop script (`while (true) {}`) ends as `terminated` without freezing the page (the HUD keeps updating). At least two screenshots in `docs/journal/assets/015-*.png`.

## Docs checklist

- [ ] `docs/STATUS.md`, journal `015`, `architecture/scripting.md` and `overview.md` (web wiring), `research/scripting.md` + `research/web-client.md`, `stack-versions.md`, ADR 0022 and index.

## Log

- 2026-10-16 — Created as draft by plan 010 (web integration pushed out of scope).
- 2026-10-16 — Refined draft -> ready at the human's request (session: script-web session). ADR 0022: runner inside the sim Worker. Acceptance criteria made executable.
- 2026-10-16 — Started (in-progress).
