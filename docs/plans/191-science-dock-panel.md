---
id: 191
title: "Science dock panel: experiments, results and transmit in flight"
status: draft
owner: ""
depends: [103, 112]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 191 — Science dock panel: experiments, results and transmit in flight

## Goal

In flight the player sees the vessel's experiments with their state (READY, RUNNING, PAUSED, INVALID with the reason), runs them, sees stored science data with its value and transmit factor, and transmits or keeps it. The panel is stock content through `definePanel` (plan 112).

## Context

- ADRs: 0099, 0178, 0102 point 4 (dock panels).
- Plan 103 built the model: `VesselSnapshot.science`, data items (083), `transmit-data`, the `run` action.

## Scope

**In:** a stock dock panel: experiments list with Run; stored items with value, factor and Transmit; the current situation.

**Out:** the Mission Center science view (113), dossiers (104).

## Touches

- **Size:** S
- **Edits:** `mods/stock` (panel), `apps/web/src/lib/hud` (only if 112 needs a host hook)
- **Shared contracts:** none

## Steps

1. Panel view from the snapshot.
2. Commands from its buttons.

## Acceptance criteria

- [ ] vitest: the panel shows an INVALID experiment with its reason and a stored item with its transmit value; the Run and Transmit buttons send `action run` and `transmit-data`.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated.
- [ ] `docs/journal/191-science-dock-panel.md` written.

## Log

- 2026-10-17 — Created as a draft by Agent 3 while refining plan 103: the HUD card left out of 103.
