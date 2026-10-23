# 0324 — A company's way out of debt

**Status:** accepted
**Date:** 2026-10-23
**Plan:** the player-journey audit, Q3 (`docs/research/player-journey-audit.md`)
**Builds on:** ADR 0113 (the economy), ADR 0176 (crew hiring), ADR 0187 (strategies and agency types)

## Context

A company agency had no budget. Its contracts were its only income, and those need launches, so once it was in debt it could never launch again:
- Launches were refused, and production stopped while the agency was in debt.
- Hiring still worked, and dug the debt deeper.
- Nothing on screen said how the agency's money works.

## Decision

1. **Service contracts.** A company earns a standing 6 000 funds every 30 days (`stock.company-services`, scaled by the funds multiplier). An idle company's running costs are covered: at the start, +6 000 against 3 200 operations and 1 200–2 000 upkeep.
2. **A loan.**
   - `loan-take { amount }` borrows up to `LOAN.limit` (100 000 × the cost multiplier) in total; the funds come at once. `loan-repay { amount }` pays back from funds, up to what is owed.
   - Every 30 days, 2 % of what is owed is charged as `economy.interest`.
   - What is owed is saved in `SaveEconomy.loan` and reported in `Snapshot.economy.loan`. API 0.1.118.
3. **No spending past zero.** Hiring is refused when the recruit fee is more than the funds, as construction and launches already were.
4. **Explained.** Administration's new Finances tab shows:
   - each income and cost every 30 days (the budget, grant or service contracts; operations; building upkeep; strategies; loan interest) and their net;
   - the loan with Borrow and Repay in 25 000 steps;
   - how the money works for this agency type: crew are paid while they fly, hiring and building need funds, and recovery pays back hardware.

## Consequences

- A company in debt can borrow, launch a contract and pay back. The interest is the price.
- Government and hybrid agencies are unchanged unless they borrow; the career-bot guardrails keep their numbers.
