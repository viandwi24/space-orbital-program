---
id: 018
title: Script sharing container and ship API constants
status: draft
owner: ""
depends: [017]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 018 — Script sharing container and ship API constants

## Goal

Prepare scripts for being shared between players and let them read what they currently cannot: decide and, if needed, build the stronger container (the runner in its own Worker, ADR 0022 alternative), and add engine and reaction-wheel constants to the script `ship` API (journal 010).

## Context

- Read: ADR 0020, ADR 0022 ("Alternatives considered", "Consequences"), journals 010 and 015, `architecture/scripting.md`.

## Scope

**In (to refine):**
- Whether and how the runner moves to a dedicated Worker (snapshot fan-out, command return path, latency for the PD attitude loop, `Worker.terminate()` as hard kill); supersede or amend ADR 0022 before scripts can be shared.
- Engine and wheel constants (thrust, Isp, torque) in `ship`, from part definitions, without exposing module internals unsafely.

**Out:** the share/import UI itself, syntax highlighting.

## Steps

1. Refine the scope and acceptance criteria.

## Acceptance criteria

- [ ] To be written when refined (each executable; `[manual]` only for UI).

## Docs checklist

- [ ] `STATUS.md`, journal, `architecture/scripting.md`, ADR.

## Log

- 2026-10-16 — Created as draft by plan 017 (items split out of draft 017: conditional on scripts becoming shareable).
