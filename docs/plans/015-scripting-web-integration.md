---
id: 015
title: Scripting in the web client
status: draft
owner: ""
depends: [010]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 015 — Scripting in the web client

## Goal

A player can paste a script in the web client, run it against the active vessel, see its `print` output and status, and stop it. The runner from plan 010 runs off the main thread so a slow script cannot cost frames.

## Context

- Read: ADR 0020 and `docs/architecture/scripting.md` (runner contract, budget semantics, the unaudited-WASM note), `apps/web/src/lib/{sim-host,sim-client,messages}.ts` (the Worker protocol: snapshots every tick, async `dispatch`).
- Open questions for refinement: run the runner inside the existing sim Worker (no snapshot hop, dispatch is a direct call) or in its own Worker (isolates a stall, needs a snapshot fan-out); how Vite bundles the `quickjs-emscripten` WASM inside a module Worker (research it first, `docs/research/scripting.md` notes the `new URL(..., import.meta.url)` loader); `[manual]` browser check.

## Scope

**In:** host wiring (messages `script-start`/`script-stop`/`script-log`), a minimal script panel in the flight view, the sample ascent as a template, vitest tests with a mocked Worker (same pattern as `sim-host.test.ts`).
**Out:** editor polish (syntax highlighting, completion), script sharing, persistence, TypeScript scripts.

## Steps

1. Research the Vite + WASM + Worker loading for `quickjs-emscripten`; record in `research/scripting.md`.
2. Host: create a runner on `script-start` with the active vessel and the catalog, tick it after each `sim.step`, dispatch commands, post status/logs.
3. UI panel; `[manual]` run of the sample ascent in the browser, recorded in the journal.

## Acceptance criteria

- [ ] `bun run --filter @orbital/web test` passes, including a host test: a script's commands reach the sim and a looping script is reported `terminated` while snapshots keep flowing.
- [ ] `bun run build` passes with the WASM asset bundled.
- [ ] `[manual]` the sample ascent reaches orbit from the script panel.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, `architecture/scripting.md` and `overview.md` (web wiring).

## Log

- 2026-10-16 — Created as draft by plan 010 (web integration pushed out of scope).
