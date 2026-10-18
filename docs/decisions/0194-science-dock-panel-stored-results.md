# 0194 — The science dock panel: stored results in the snapshot, Run and Transmit over a fixed view

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 191
**Builds on:** ADR 0178 (science results, `transmit-data`), 0149 (dock panels), 0172 (data items).

## Context

Plan 191 shows the vessel's experiments and stored science in a stock dock panel. Two gaps:

- The snapshot carried only the count of data items (`VesselSnapshot.data.items`), so a panel could not show or transmit a result.
- A panel's view is fixed at definition (ADR 0149): it cannot draw one button per experiment or per item.

## Decision

1. **`VesselSnapshot.science.stored`** (optional, additive): each science result aboard as `{ item, subject, value, factor }`. `factor` is the item's `transmitFactor`, or 1 without one, the same rule `transmit-data` applies. It is present only when there is at least one such result. API 0.1.74.
2. **Two buttons over lists.** The panel `stock.science` lists experiments (state, progress, the INVALID reason) and stored results (value, factor, credit).
   - **Run the next experiment** runs the first READY experiment, else the first INVALID one, because a new situation may allow it.
   - **Transmit the best result** sends the stored result with the highest `value × factor`.
   - Both buttons are disabled when there is nothing to act on.
3. **Stock content.** The panel is registered by stock through `definePanel`, in the flight and map contexts. A mod may add a richer panel next to it.

## Consequences

- A per-item choice (transmit this one, keep that one) waits for panel nodes with per-row buttons. That needs a later ADR 0149 amendment.
- The snapshot grows by one entry per stored result. Vessels carry a handful of them.
