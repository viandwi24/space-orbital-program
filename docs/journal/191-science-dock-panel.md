# 191 — Science dock panel: experiments, results and transmit in flight

**Plan:** [plans/191-science-dock-panel.md](../plans/191-science-dock-panel.md) · **Session:** Agent 1 (Lead), 2026-10-18 · **ADRs:** [0194](../decisions/0194-science-dock-panel-stored-results.md) (new), [0178](../decisions/0178-science-situations-subjects-value-curve-states-credit.md), [0149](../decisions/0149-define-panel-view-nodes-panel-input-canvas-and-the-dock.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `packages/core/src/protocol.ts`, `packages/sim/src/science.ts` | `VesselSnapshot.science.stored`: each science result aboard with its value and transmit factor (API 0.1.74) |
| `mods/stock/src/panels.ts` | `PanelScience` (`stock.science`): situation, experiments, stored results, Run the next experiment, Transmit the best result |
| tests | web vitest `dock/science-panel.test.ts` (3); sim `science.test.ts` checks the stored list before and after a transmit |

## What surprised me

- **The snapshot had no item list.** Only the count of data items reached the client, so the plan's "Shared contracts: none" did not hold. One additive field fixed it (ADR 0194).
- **A dock view is fixed at definition.** It cannot draw a button per row, so the panel has one Run and one Transmit button, and each picks its target.
