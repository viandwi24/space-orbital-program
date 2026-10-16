---
id: 043
title: "Save and load game"
status: draft
owner: ""
depends: [042]
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 043 — Save and load game

## Goal

A player can quicksave/quickload, keep named saves, get an autosave, close the tab and resume the flight exactly (all vessels, debris, time, warp state, module states), with a versioned, migratable save format and a load screen in the main menu.

## Context

- ADR 0048. World serialisation exists (`world.serialize`, plan 003); sim state beyond the world (rails states, frames, accumulators, rng) must round-trip. Library storage pattern: ADR 0041 (IndexedDB).

## Scope

**In:** `sim.save()`/`createSim({ resume })` (additive API), determinism after resume (a resumed run equals an uninterrupted run byte-for-byte), save storage in IndexedDB with export/import file, save list UI with thumbnail/time/vessel, F5/F9, autosave interval, format version + migration tests, corrupt-save handling.
**Out:** cloud saves.

## Acceptance criteria

- [ ] To be made measurable at refinement. Must include: resume determinism test at several points (pad, ascent, staging, orbit on rails, landed on terrain); migration test; UI vitest; manual save/close/reload/resume in the browser with screenshots; all repo checks.

## Docs checklist

- [ ] STATUS, journal, ADR, `simulation.md`.

## Log

- 2026-10-17 — Created as draft (ADR 0048, v1 scope).
