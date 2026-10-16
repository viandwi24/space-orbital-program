# 0042 — Stability read-out: centre of mass against centre of pressure, from part data

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/029-vab-follow-ups.md
**Builds on:** ADR 0035 (`stock.fin`), ADR 0017 (drag), journal 026.

## Context

A finned rocket whose fins sit ahead of its centre of mass tumbles, and the VAB says nothing. The sim has drag per part (quadratic cross-flow, which has no restoring slope at small angles of attack) and, for `stock.fin`, a linear normal force `-1/2 rho V^2 S liftSlope sin a cos a` at the fin's `centre` (ADR 0035). A read-out has to follow what the sim does, not a textbook model.

## Decision

The VAB computes, in `apps/web/src/lib/editor/stability.ts` from part data only (no sim, no core change):

- **Centre of mass** along the vessel axis (design frame, +y up): sum of `y_i * m_i` over the parts' dry mass plus resources at full tanks (the numbers `designStats` uses), and the same with empty tanks (burnout).
- **Centre of pressure** at small angle of attack: the lift-slope-weighted mean height of the lifting surfaces, `sum(liftSlope_i * area_i * y_i) / sum(liftSlope_i * area_i)` over parts carrying a `stock.fin` module, `y_i` = part height + the module's `centre.y`. Body parts add a normal force only through cross-flow drag, which is quadratic in the angle; they are included as a secant slope at a reference angle of attack of 6 degrees (`dragCoefficient * lateral area * sin 6 deg`, at the part's centre), so a design with no fins still has a defined CoP (it sits near the middle of the body, above a heavy engine's CoM).
- **Margin** `(CoM - CoP) / D` in body calibres, `D` the widest cylinder's diameter. Positive: CoP behind (below) the CoM, stable. The read-out shows the margin, both heights, and a state: `stable` (margin at least 1), `marginal` (0 to 1), `unstable` (below 0).
- **View**: the 3D view draws a CoM marker and a CoP marker on the vessel axis; the stats strip shows the state with the margin.
- **Check**: `unstable` is a launch **warning** only when the design carries lifting surfaces; an unfinned rocket is shown as "unfinned: held by the reaction wheel" without a warning, because every stock starter rocket is unfinned and flies (journal 009, 026). Unstable with fins is the case that cannot be steered out and was the reported shortfall.

Only `stock.fin` is read; a mod's own lifting module is not counted until the module descriptor mechanism (ADR 0033) grows a lift field (recorded in the plan's drafts).

## Alternatives considered

- **Barrowman equations.** Textbook for model rockets with known fin geometry; the sim's fin is a flat plate with its own slope and area, so a read-out in different units would disagree with flight.
- **Warn on every unfinned design.** Noise on the first rocket a player builds.
- **Run the sim for a few seconds.** Accurate but slow and in the sim package's territory; part data answers the question.

## Consequences

- The read-out is a guide at small angles, not a flight result; the doc says so.
- A mod's lift module needs a descriptor field to be included (follow-up).
