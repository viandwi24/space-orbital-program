---
id: 308
title: "Attach to sideways nodes: the editor turns a part onto a hub's side ports"
status: done
owner: "part visuals session (Claude)"
depends: [279, 303]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 308 — Attach to sideways nodes

## Goal

A part can attach to any free stack node, whatever way it points: the hub's four side ports take a module, a truss or a docking port. The Horizon Station blueprint uses them.

## Context

- Journal 303: the editor only offered a node whose direction is opposite the child's node, so the hub's east/west/north/south ports were unusable.
- ADR 0071 (format 3 tilt), ADR 0258 (free placement): a tilt can turn the part any way.

## Scope

**In:** `resolveVesselDesign` accepts a stack link whose tilt turns the child's node to face the parent's; `attachTargets` offers a node at right angles to the child's node (never a flip) with the tilt that turns the child's node to face it (`AttachTarget.tilt`); `join` writes the tilt on the attached root; the mission builder's `side` port helper; Horizon Station on the hub's side ports; tests.
**Out:** a picked assembly that is already tilted (the tilt is kept as it is; no sideways match is offered for it).

## Steps

1. `AttachTarget.tilt`, computed by `rotationBetween(childDir, -parentDir)` and `tiltOfMatrix`.
2. `join` sets the root part's `tilt`; the core resolver checks the node direction after the tilt as well as before.
3. Missions: Horizon Station's modules on the hub's sides.
4. Tests.

## Acceptance criteria

- [x] A hub's four side nodes appear in `attachTargets` for a stack part, and attaching resolves the part with its node on the port, pointing out.
- [x] Horizon Station has modules on at least two side ports and passes the mission checks.

## Docs checklist

- [x] `docs/STATUS.md`, journal `308-sideways-node-attach.md`.

## Log

- 2026-10-21 — Started after plan 306.
- 2026-10-21 — Done. A turned match is a fallback: a node that something fits onto straight offers only that, so the shuttle's radial decoupler and every plain stack keep their old targets.
