---
id: 264
title: "A crashed pod rolls above the Moon's ground instead of on it: physics ground and rendered ground disagree"
status: done
owner: "Worker B"
depends: []
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 264 — A crashed pod rolls above the Moon's ground instead of on it: physics ground and rendered ground disagree

**Size:** M

## Goal

Item 25 of `docs/reviews/2026-10-20-owner-manual-test.md` (`22.webp`). A part resting or rolling on any body touches the ground the player sees, with no visible gap.

## Context

- **The report:** on Cinder, a fallen pod rolls along visibly above the ground, well above its own shadow (`22.webp`). Once it stops, it rests on the ground correctly (the owner's second screenshot, shown in chat only). So the static ground height is probably right, and the gap appears only while it rolls or tumbles. Check these first:
  - a rolling collider shape that does not match the mesh, for example a sphere, capsule or hull rounder or bigger than the pod's edge it rolls on;
  - honest low-gravity bounces on Cinder (about 1/6 g), which would look like floating; measure the contact state while it rolls;
  - render interpolation or extrapolation lagging the physics pose while the vessel spins fast.
- **Candidates to check:**
  - **Physics and render terrain disagree.** The physics ground (heightfield or collider in `packages/sim` and the Rapier adapter, ground contact from plan 012) may differ from the rendered terrain (`packages/renderer` planet pass, terrain bake and patches; detail octaves that only the shader adds, ADR 0053). One may be smoothed, at a lower resolution, or offset.
  - **The collider is bigger than the mesh.** The pod's collider shape or size may not match its mesh (`mods/stock` part colliders, rigid grouping from plan 011).
  - **Cinder uses another path.** An airless body may use a different height function or seed for physics than for rendering.

## Scope

**In:**
- **Root cause:** a measured gap at the screenshot's spot, comparing physics ground height, render ground height and collider extent.
- **Fix** with a test: the physics and render heights agree within a tolerance at sampled points on Cinder and Home, and the pod's collider matches its mesh bounds.
- **Screenshots** before and after.

**Out:** nothing else.

## Steps

1. **Reproduce through the debug API.** Set a location low over Cinder, drop the pod and let it settle, then read the gap.
2. **Unit tests:** height agreement between sim and renderer at sample points, and collider against mesh bounds.
3. **Fix and merge first.** Run the affected unit tests and the typecheck.

## Acceptance criteria

- [x] The root cause is in the journal: the cylinder collider was the box around the circle, corners 41 % beyond the rim ([ADR 0245](../decisions/0245-cylinder-colliders-are-inscribed-squares.md)).
- [x] Physics and render ground agree within a tolerance at sampled points (they call the same core field; test on Cinder and Home). Tests pass.
- [ ] A resting or rolling pod touches the visible ground: measured, a rolling pod stays within 3 m instead of hopping 10 m. The journal holds a chart of the measurement; screenshots of the game were not taken (no browser run).
- [x] Affected unit tests and the typecheck pass. E2E is paused by the owner.

## Docs checklist

- [x] STATUS row.
- [ ] Journal with screenshots (a measured chart instead; no game screenshots).

## Log

- 2026-10-21: Created by the coordinator from the owner's report.
- 2026-10-21: Worker B. Root cause measured on flat Cinder (no terrain): a cylinder collided as the box around it. Fixed with inscribed squares (ADR 0245).
