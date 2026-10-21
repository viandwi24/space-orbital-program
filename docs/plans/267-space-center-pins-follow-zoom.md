---
id: 267
title: "Space Center pins stay behind when the camera zooms, until it is turned"
status: done
owner: "space-center pins session"
depends: [259]
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 267 — Space Center pins stay behind when the camera zooms, until it is turned

**Size:** S

## Goal

Owner report, 2026-10-21 (in chat, with a night screenshot of `/space-center`): when the camera zooms in or out, the building pins (plan 259, ADR 0244) sometimes stay where they were instead of following their buildings, and come back only when the camera is panned or turned. Every pin stays on its building during and after a zoom, on WebGL and WebGPU.

## Context

- The loop `apps/web/src/lib/space-center/space-center-loop.ts` calls `onFrame(project)` every animation frame after `renderer.render()`; `project` is `renderer.projectSite`.
- The page (`apps/web/src/routes/(world)/space-center/+page.svelte`) turns the projections into pin positions.

## Scope

**In:** the cause, the fix, a unit test, a browser check on both renderers.
**Out:** spreading the tags apart without moving the dots (ADR 0251, alternatives).

## Steps

1. Find where the pins are placed and why a zoom does not move them.
2. Fix it and add a test where the pins follow a camera-distance change.
3. Check in the browser with the wheel, `?renderer=webgl` and `?renderer=webgpu`.

## Acceptance criteria

- [x] The cause is found and recorded: not a stale projection but `spreadLabels`, which lifted overlapping pins 40 px each when a zoom out brought the buildings together ([ADR 0251](../decisions/0251-space-center-pins-stay-on-their-anchors.md)).
- [x] Pins sit on their anchors (`pinPositions`); a unit test runs an eased zoom out and back in and fails on the old code.
- [x] In the browser, after zooming out and back in with the wheel, the pins are on their buildings on WebGL and on WebGPU (journal).
- [x] `bun run test`, `bun run typecheck`, `bun run lint` and the web vitest run with `CI=true` pass (journal).

## Docs checklist

- [x] STATUS row, ADR 0251 and its index row, journal.

## Log

- 2026-10-21: Created and done by the space-center pins session from the owner's report.
