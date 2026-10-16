---
id: 030
title: Script hardening and tooling follow-ups
status: draft
owner: ""
depends: [018]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 030 — Script hardening and tooling follow-ups

## Goal

Items pushed out of plan 018 that matter once scripts are shared and the game is hosted publicly.

## Context

- Read: ADR 0031 (alternatives considered), `research/scripting.md` (CSP for workers), `guides/scripting.md`, journal 018.

## Scope

**In (to refine):**
- Hosting-level containment: serve `script.worker` with a `Content-Security-Policy` response header (`connect-src 'none'`) once the hosting is chosen (a static build cannot set it from the repo; plan 023 / deployment), and evaluate running the script Worker from a sandboxed iframe (opaque origin: no IndexedDB, storage or same-origin fetch). Verify support and CSP inheritance online first.
- Nested Workers in Safari and Firefox: only the built-in Chromium browser was exercised in plan 018.
- Share/import UI for scripts (paste, import from file, a "this code is from a stranger" confirmation), syntax highlighting, error line numbers in the panel.
- Script API additions players will ask for: other bodies' data, target/maneuver info, `ship.engines` for gimbal, `Date` hidden for deterministic replays, command refusal feedback to the script (`stage()` returns whether it fired).

**Out:** moving scripting to a server.

## Steps

1. Refine; ADR if the iframe arrangement is chosen.

## Acceptance criteria

- [ ] To be written when refined (each executable; `[manual]` only for UI).

## Docs checklist

- [ ] `STATUS.md`, journal, `architecture/scripting.md`, `guides/scripting.md`, ADR.

## Log

- 2026-10-16 — Created as draft by plan 018.
