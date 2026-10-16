---
id: 017
title: Script panel follow-ups
status: draft
owner: ""
depends: [015]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 017 — Script panel follow-ups

## Goal

Close the gaps plan 015 found in the flight-view script panel and its host: scripts persist between sessions, the HUD stage counter is truthful when a script stages, and the runner can move to its own Worker if sharing scripts ever needs the stronger container.

## Context

- Read: ADR 0022 (runner in the sim Worker, trade-offs of a second Worker), `docs/architecture/scripting.md` (web section), journal 015.

## Scope

**In (to refine):**
- Persist the script source per design in `localStorage` (same hand-off style as `orbital.design`).
- `FlightHud.stagesDone` only counts `stage` commands the page sent; a script's `stage()` is not counted (seen in the manual run: "0 / 2 fired" after the sample staged). Derive it from the snapshot or report it from the host.
- Decide whether the runner moves to a dedicated Worker (snapshot fan-out, command return path); revisit ADR 0022 when scripts become shareable.
- A script's `ship` API still lacks engine and wheel constants (journal 010).

**Out:** syntax highlighting, completion, TypeScript scripts.

## Steps

1. Refine the scope and acceptance criteria.

## Acceptance criteria

- [ ] To be written when refined (each executable; `[manual]` only for UI).

## Docs checklist

- [ ] `STATUS.md`, journal, `architecture/scripting.md`.

## Log

- 2026-10-16 — Created as draft by plan 015.
