# 0003 — Simulation is headless and separate from rendering

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/001-repo-bootstrap.md

## Context

The thing most likely to change over the project's life is *where* and *how* the simulation runs: main thread today, Worker tomorrow, server for multiplayer, partly WASM later. The renderer and UI will also change. Coupling them would freeze both.

## Decision

`core`, `kepler`, `sim`, `sdk` and all mods are environment-neutral libraries: no DOM, no Bun/Node APIs, no rendering. The simulation exposes `step(dt)`, accepts plain-data commands and emits plain-data snapshots. Rendering and UI live outside and only read snapshots. Time is an input; `sim` never reads a clock.

## Alternatives considered

- **Game-engine style where entities own meshes** — fast to prototype, impossible to run headless or move to a Worker. Rejected.

## Consequences

- Every feature must be testable in `bun test` with no browser. This is a feature: the Phase 0 end-to-end test is a headless orbit.
- A message protocol (`architecture/simulation.md`) must be maintained.
- Some duplication of position data between sim and renderer; acceptable.
