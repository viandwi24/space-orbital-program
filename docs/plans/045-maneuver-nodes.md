---
id: 045
title: "Maneuver nodes"
status: draft
owner: ""
depends: [044]
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 045 — Maneuver nodes

## Goal

A player plans burns in the map view: place a node on the orbit, drag prograde/normal/radial handles, see the predicted orbit (including SOI encounters and closest approach to the moon), the Δv and estimated burn time, a navball maneuver marker and a burn countdown; SAS can point at the node; scripts can read and create nodes.

## Context

- ADR 0048; plans 042 (SAS), 044 (SOI), 021/024 (HUD, `Renderer.project`), 035 (script data — fold the node part in here).

## Scope

**In:** node data in the protocol/save, prediction (kepler + patched conics), map-view handles with mouse and keyboard, burn time from current stage thrust/mass (delta-v.ts), navball marker, SAS maneuver mode, warp-to-node, script API.
**Out:** multiple chained transfers optimisation.

## Acceptance criteria

- [ ] To be made measurable at refinement. Must include: prediction tests against propagation; burn-time tests; UI vitest; manual: plan and execute a moon transfer using nodes + SAS in the browser, screenshots; all repo checks.

## Docs checklist

- [ ] STATUS, journal, ADR, scripting guide.

## Log

- 2026-10-17 — Created as draft (ADR 0048, v1 scope).
