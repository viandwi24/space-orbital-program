---
id: 193
title: "Splash and ripples at the waterline"
status: draft
owner: ""
depends: [067]
phase: 3
created: 2026-10-18
updated: 2026-10-18
---

# 193 — Splash and ripples at the waterline

## Goal

A vessel that floats (plan 067) shows ripples where its hull meets the water and a splash when it comes down on it, so floating reads as floating and not as a vessel standing on a blue floor.

## Context

- ADRs: 0182 (buoyancy), 0072 (lakes, shore waves), 0090 (effects budget).
- Plan 067 put the vessel at its waterline in the sim; the renderer already draws the vessel where the sim puts it. The effects were left out of 067: they need WebGL to check, and the Linux machine has none in its browser pane.

## Scope

**In:** ring ripples at each part that crosses the water plane (expanding, fading), a splash burst on a water impact (`part:damaged` or the entry speed), both from the snapshot.

**Out:** waves that move the vessel, wakes of moving boats.

## Touches

- **Size:** S
- **Edits:** `packages/renderer/src` (effects), `apps/web/src/lib` (wiring)
- **Shared contracts:** none

## Acceptance criteria

- [ ] `packages/renderer` test: ripple rings are placed at the parts that cross the water plane of a floating snapshot, and none for a vessel on land.
- [ ] Frame cost on the M5 within the effects budget (ADR 0090).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated.
- [ ] `docs/journal/193-splash-and-ripples-at-the-waterline.md` written.

## Log

- 2026-10-18 — Created as a draft by Agent 3 while refining plan 067: the renderer effects left out of 067.
