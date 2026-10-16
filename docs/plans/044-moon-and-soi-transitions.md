---
id: 044
title: "A moon and SOI transitions"
status: draft
owner: ""
depends: [043]
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 044 — A moon and SOI transitions

## Goal

Stock ships a moon orbiting the home planet; vessels move between spheres of influence with patched conics, on rails and in flight; the map view shows both bodies, the SOI and the trajectory across it; the renderer draws the moon as a real place (terrain, no atmosphere) and a player can land on it.

## Context

- ADR 0048; `simulation.md` (single root body today), kepler `soiRadius`, ADRs 0017, 0024, 0036, 0043; renderer environment/planet pass assumes the first body.

## Scope

**In:** body hierarchy in core/sim (moon's orbit propagated analytically), SOI enter/exit events and frame changes, on-rails propagation across SOIs and time warp stopping at transitions, flight frames relative to the current SOI body, map view with focus switching, renderer support for an airless body with its own terrain function and lighting, landing on the moon, stock body data (radius/mass/orbit chosen for a reachable trip with stock parts — Δv budget in the journal), save-format update.
**Out:** more planets, interplanetary transfers.

## Acceptance criteria

- [ ] To be made measurable at refinement. Must include: kepler/sim tests for SOI transitions (state continuity within tolerance, both directions, on rails and in flight); a headless scripted mission: orbit → transfer → moon SOI → moon orbit (and ideally landing) in `bun test`; determinism; map/renderer screenshots from the moon surface and orbit; frame budget kept; all repo checks.

## Docs checklist

- [ ] STATUS, journal, ADRs, `simulation.md`, `units-and-frames.md`.

## Log

- 2026-10-17 — Created as draft (ADR 0048, v1 scope).
