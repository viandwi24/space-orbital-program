# 0148 — Hangar: pre-flight verdict levels, a tool pill without fake tools, and a centre-of-thrust marker

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [093](../plans/093-ui-stage-4-hangar.md)
**Builds on:** ADR 0029 (editor checks: errors block, warnings confirm), ADR 0107 (refs Hangar), ADR 0082 (catalogue), ADR 0146 (categories registry), ADR 0113 (costs)

## Context

The refs Hangar shows one pre-flight verdict (go, caution, no-go) pointing at the part at fault, a bottom tool bar (Place, Move, Rotate, Re-root, Staging, symmetry ×1 to ×6, CoM and CoT toggles, undo, redo) and vessel stats in a right column. The editor (ADR 0029) has checks with a severity that decides whether Launch is blocked or asks for a confirmation; it has no tool modes (a part is placed when armed from the catalogue and moved when picked up), symmetry counts 1, 2, 3, 4 and 6, and centre-of-mass and centre-of-pressure markers but none for thrust.

## Decision

1. **Two axes per check.** `severity` keeps its ADR 0029 meaning (an `error` blocks Launch, a `warning` asks to confirm). Each check also has a `level`: `no-go` when the flight cannot do anything useful (no control source, no engine, liftoff TWR under 1, an invalid or empty design) and `caution` when it may (TWR from 1 to under 1.2, no stages, unstaged parts, an empty stage, unstable aerodynamics, loose parts). The verdict is the worst level, `go` when there is none. A no-go verdict does not block Launch unless a check is an error: a player may still fly a probe without control to watch it fall.
2. **The part at fault.** `no-control` names the root part (the design's first part), `low-twr` and the new `marginal-twr` (caution, 1 ≤ TWR < 1.2) name the first stage's engines. Clicking a check highlights its parts, as today.
3. **The tool pill holds what exists.** Symmetry (the editor's 1, 2, 3, 4, 6), toggles for the CoM and CoT markers, undo and redo. Place, Move, Rotate and Re-root are not added as buttons: the editor has no modes behind them, and a button that does nothing would mislead. They come with a plan that adds editor modes.
4. **Centre of thrust.** A `cot` marker (an accent ring) at the thrust-weighted mean position of the first stage's engines along the vessel axis, drawn by the renderer like the other stability markers; the CoM toggle hides the mass and pressure markers, the CoT toggle the thrust one.
5. **Layout.** Top left: back and a Hangar capsule with the vessel name. Top right: New, Open, Save and Launch. Left: the catalogue with a vertical category rail (registry order, ADR 0146) and two-column part cards (mass · cost, `[—]` when a part has no cost). Right: Vessel (mass, parts, height, Δv, TWR, cost, stability, trip), Staging, Pre-flight. Bottom: the tool pill.

## Alternatives considered

- **Map severity to the verdict** (error = no-go) — rejected: no control would then block Launch, a change of ADR 0029 behaviour this restyle should not make.
- **Tool buttons that arm the old flows** (Move = pick up the selection) — rejected for now: the keyboard and pointer flows already do it without a mode; half-modes would confuse the help text.

## Consequences

- `Check.level`, `verdictOf(checks)`, check id `marginal-twr`; `VabMarker.kind` gains `cot` (renderer).
- The bottom keys line and the stats strip leave the bottom; their content moves to the right column.
