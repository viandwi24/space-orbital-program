---
id: 009
title: "Web client MVP: build, launch, orbit"
status: done
owner: "web session (Claude, 2026-10-16)"
depends: [007, 008]
phase: 1
created: 2026-10-16
updated: 2026-10-16
---

# 009 — Web client MVP: build, launch, orbit

## Goal

In `apps/web`: a minimal VAB (attach stock parts via a list + attach nodes, assign stages, save/load design as JSON), a flight screen (HUD with altitude, speed, apoapsis/periapsis, throttle, stage button, keyboard control), the renderer embedded, the sim running in a **Web Worker** using the protocol from `simulation.md`, and a map view. **Phase 1 exit:** a human can build the test vessel, launch, and reach orbit; the orbit is visible.

## Context

- Read: `docs/architecture/overview.md` (runtime topology), `simulation.md` (protocol), ADR 0006.
- Verify online: SvelteKit 3 + Vite 8 Worker import syntax (`new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })`), Svelte 5 runes patterns for non-reactive loops. Record in research.

## Scope

**In:** the above, keyboard controls, basic styling. UI chrome in Svelte; render loop and worker messaging outside Svelte reactivity.
**Out:** mouse-driven 3D part placement (list + node picker is fine), art, sound, settings.

## Design notes

- **Topology:** the Worker owns the clock. `src/lib/sim-host.ts` is the worker-side message handler (`createSimHost({ post, createSim })`, testable in Node with a mocked `post`); `src/lib/sim.worker.ts` is a thin shell that wires it to `self` and boots `createSim({ plugins: [Stock], backendFactory: () => createRapierBackend({ solverIterations: 16 }) })`. A `setInterval` loop in the host measures wall time, clamps it to 0.1 s and calls `sim.step`, then posts `snapshot` messages at about 30 Hz. `src/lib/sim-client.ts` is the main-thread wrapper over any `{ postMessage, onmessage }` (a real `Worker` or a test double): `ready` promise, `dispatch(command) -> Promise<CommandResult>`, `onSnapshot`, `dispose`.
- **Messages** (`src/lib/messages.ts`, plain data): client to worker `{ kind: 'command', id, command: unknown }`, `{ kind: 'dispose' }`; worker to client `{ kind: 'ready', plugins, parts, bodies }` (loaded plugin ids, part definitions with shape/attach nodes/title/mass, body definitions: all main-thread data comes from the worker, so the main thread needs no plugin load for the HUD, but the renderer still gets `partShapes`/`bodies` from it), `{ kind: 'snapshot', snapshot }`, `{ kind: 'result', id, result }`, `{ kind: 'error', message }`. Commands cross the wire as `unknown` and are validated by `sim.dispatch`.
- **Pages:** `/vab` and `/flight` get `+page.ts` with `ssr = false` (prerender shell, ADR 0006). Svelte renders only chrome; the rAF loop, the renderer and the Worker callbacks are plain TypeScript in `src/lib/` and only a ~10 Hz telemetry object is copied into `$state.raw`.
- **State between pages:** the current design JSON is stored in `localStorage` (`orbital.design`) by the VAB and read by `/flight`, which sends `load-vessel`. Download/upload of `*.json` in the VAB uses `vesselDesignSchema` + `resolveVesselDesign` for validation.
- **VAB:** `src/lib/design.ts` has pure functions (`emptyDesign`, `addPart`, `removePart` (with its subtree), `setStage`, `serialiseDesign`, `parseDesign`, `defaultTwoStage`) so serialisation is unit-tested. UI: part palette (title, mass), a list of the placed parts with a stage selector per part, attach-node pickers (`parentNode` of the selected parent, `node` of the new part, from the part definitions' `attach`), validation errors from `resolveVesselDesign`, a button that loads the reference two-stage vessel, save/load JSON, Launch.
- **Flight:** keyboard: Shift/Ctrl throttle up/down, Z full, X cut, W/S pitch, A/D yaw, Q/E roll, Space stage, M map, `,`/`.` warp down/up (1, 2, 5, 10, 50, 100, 1000, 10000, 100000), mouse drag/wheel orbits the camera. HUD: altitude, speed, apoapsis, periapsis, throttle, stage, warp (with refusal reason), time, vessel mode. A dev-only autopilot (toggle `P`, only when `import.meta.env.DEV`) is allowed only if hand-flying through browser tool calls proves infeasible; it must be recorded as such in the journal and must go through the same `dispatch` path.
- **Renderer in a real browser:** `partShapes` is built from the worker-supplied part definitions (size tuple to `Vec3`). First real-GL run checks `Line2` orbit line and marker sizing; only small fixes in `packages/renderer` are in scope and are logged.

## Steps

1. `cd apps/web && bun add @orbital/physics@workspace:* @orbital/kepler@workspace:*` (workspace deps only; check `bun.lock` diff). Add `messages.ts`, `sim-host.ts`, `sim.worker.ts`, `sim-client.ts` and their vitest tests: `sim-client.test.ts` (request/response correlation, snapshot fan-out, error rejection, dispose) and `sim-host.test.ts` (**worker boot**: real `createSim` with Stock and Rapier, host posts `ready` listing `stock`, then `load-vessel` through the command message and a snapshot with that vessel).
2. `design.ts` + `design.test.ts` (round trip, add/remove subtree, stage assignment, invalid JSON rejected, reference vessel resolves against the stock registries).
3. `/vab` route and components (Svelte chrome), launch hand-off via `localStorage`.
4. `flight-loop.ts` (rAF render loop, keyboard to commands, telemetry, camera drag), `/flight` route with HUD and map toggle; `format.ts` helpers reused.
5. `vite build` check that the worker is emitted; `bun run build`, svelte-check, prettier.
6. `[manual]` run with the built-in browser (`.claude/launch.json` entry for `bun run dev`): build the 2-stage vessel in `/vab` through the UI, launch, stage, reach periapsis > 70 km, open map view, save at least two screenshots to `docs/journal/assets/009-*.png`, record the run in the journal (times, final Ap/Pe, whether the autopilot was used).

## Acceptance criteria

- [x] `bun run build` succeeds (static output contains `/vab`, `/flight` pages and the worker chunk); `bun run --filter @orbital/web test` passes.
- [x] Worker boot: a vitest test (`sim-host.test.ts`) asserts the host reports `ready` with the stock plugin loaded and then serves a `load-vessel` command and a snapshot, using a node-side `post` mock (real `createSim` + Rapier).
- [x] `sim-client` and design serialisation unit tests pass (listed above).
- [x] `[manual]` From a clean `bun run dev`: build the 2-stage test vessel in `/vab`, launch, reach periapsis > 70 km; map view shows the orbit line. Journal records the run with screenshots in `docs/journal/assets/009-*.png`.
- [x] `bun run typecheck` (0 svelte-check errors), `bun run docs:check` and `bun test` pass.

## Docs checklist

- [x] `docs/STATUS.md` (Phase 1 complete), journal with screenshots under `docs/journal/assets/`, research.

## Log

- 2026-10-16 — Created as draft.
- 2026-10-16 — Refined draft → ready at the human's request (session: web session). Research in `research/web-client.md`.
- 2026-10-16 — Implemented. Evidence: `bun run --filter @orbital/web test` 21 passed (sim-client, sim-host worker boot with real createSim + Rapier, design, telemetry, format); `bun run build` ok (`vab.html`, `flight.html`, worker chunk); web `svelte-check` 0 errors; manual run in the built-in browser: periapsis 76.03 km, apoapsis 271.48 km on rails, map view orbit line drawn (journal 009, `docs/journal/assets/009-*.png`). The ascent used a dev-only autopilot (hand-flying was infeasible through tool calls); build, launch, staging key and map view were via the UI.
- 2026-10-16 — Deviations: renderer flight camera made radial-up (`packages/renderer/src/scene.ts`, test added) because the pad is not at the pole; draft plan 013 created (debris blocks time warp). Global `bun test`/`typecheck` showed failures from plan 012's in-flight edits (landing legs in mod-stock/sim), not from this plan; see the final report.
