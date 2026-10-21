---
id: 268
title: "Vessel panel Parts tab: even gaps between groups and part rows, and the two transfer buttons drawn on top of each other"
status: done
owner: "vessel-panel session"
depends: [256]
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 268 — Vessel panel Parts tab: even gaps between groups and part rows, and the two transfer buttons drawn on top of each other

**Size:** S

## Goal

Fix two things the owner reported on 2026-10-21 from the flight vessel panel's Parts tab (vessel "Moon shot", COMMAND group open, Command Pod expanded):

1. The accordion items touch: no gap between a group header ("COMMAND 1") and its part rows, between part rows, or between groups.
2. In an expanded container part, the "Transfer out" and "Transfer in" buttons (the `stock.resource-container` triggers of plan 214) draw on top of each other in one small box, reading "Trameffer ouint".

## Context

- `apps/web/src/lib/vessel-panel/VesselPanel.svelte` (Parts tab, plan 256 accordions), `ControlRows.svelte` (shared with the part inspector, plan 214).
- `apps/web/src/lib/ui/tokens.css`: the spacing scale `--s-1` to `--s-6` (4 px grid).
- Plans 214, 254, 256.

## Scope

**In:** the Parts tab's spacing; the trigger buttons' layout in `ControlRows` (so the inspector gets the same fix).
**Out:** what the transfer triggers do (they are picker hooks of plan 214; the Resources tab holds the picker). Renderer, graphics settings and sim code.

## Design notes

- Cause of item 2: `.row` sets `container-type: inline-size` (plan 250, for the slider's narrow form). A trigger row is `inline-flex`, and an inline-size container has no intrinsic width, so each trigger row shrank to zero and both buttons overflowed onto the same spot. A trigger has no slider, so its row drops the container type; the label does not wrap.
- Item 1: header to first row and row to row `--s-2` (8 px); group to group `--s-4` (16 px); the search field to the first group `--s-3`. A closed group's header carries no bottom margin.

## Steps

1. Trigger rows: `container-type: normal`, no wrap in the button.
2. Parts tab gaps from the tokens.
3. Check in the browser: Moon shot, several groups open, the pod expanded, panel at 300 and 440 px, high contrast on.
4. `bun run lint`, `bun run typecheck`, the web vitest run with `CI=true`.

## Acceptance criteria

- [x] [manual, checked by the agent in the browser] The pod's "Transfer out" and "Transfer in" are two separate, readable buttons at panel widths 300 and 440 px, in normal and high contrast.
- [x] [manual, checked by the agent in the browser] Group header to row and row to row gaps are 8 px, group to group 16 px (measured with `getBoundingClientRect`).
- [ ] `bun run lint` passes. This plan's files pass; three files of other sessions' uncommitted work fail Prettier (journal).
- [x] `bun run typecheck` passes.
- [ ] `CI=true bunx vitest run` in `apps/web` passes. 1341 pass, 2 fail in `sim-host-script-worker.test.ts`, which this change does not reach (journal); `src/lib/vessel-panel` 16/16.
- [x] `bun run docs:check`: no problem from plan 268 (the 3 it reports are other sessions' unfinished 266, 270 and ADR 0252).

## Docs checklist

- [x] `docs/STATUS.md` board row.
- [x] `docs/journal/268-vessel-panel-parts-spacing.md` written.

## Log

- 2026-10-21 — Started. Number 268 taken so the two parallel owner-report sessions (launch "no free physics frame", Space Center pins) can use 266 and 267.
- 2026-10-21 — Done. Cause and measurements are in the journal. Lint and the web vitest run fail on other sessions' uncommitted work in the shared folder, not on this plan's files.
