---
id: 009
title: "Web client MVP: build, launch, orbit"
status: draft
owner: ""
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

## Steps

1. `src/lib/sim.worker.ts` hosting `createSim`; `src/lib/sim-client.ts` (typed postMessage wrapper).
2. Routes `/vab`, `/flight` (+ map toggle); components.
3. Vitest unit tests for `sim-client` message handling and VAB design serialisation.
4. `[manual]` checklist executed and recorded in the journal with a screenshot path.

## Acceptance criteria

- [ ] `bun run build` succeeds; `bun run --filter @orbital/web test` passes.
- [ ] Worker boot: a vitest test asserts the worker reports `ready` with the stock plugin loaded (use a node-side mock of `postMessage` if browser testing is not set up; otherwise `[manual]`).
- [ ] `[manual]` From a clean `bun run dev`: build the 2-stage test vessel in `/vab`, launch, reach periapsis > 70 km; map view shows the orbit. Journal records the run.
- [ ] `bun run typecheck`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` (Phase 1 complete), journal with screenshots under `docs/journal/assets/`, research.

## Log

- 2026-10-16 — Created as draft.
