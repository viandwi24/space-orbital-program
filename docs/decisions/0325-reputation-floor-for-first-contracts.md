# 0325 — The first contracts open from reputation −20, and reputation settles at 0

**Status:** accepted
**Date:** 2026-10-23
**Plan:** the player-journey audit, Q4 (`docs/research/player-journey-audit.md`)
**Builds on:** ADR 0186 (procedural contracts and tiers), ADR 0113 point 7 (reputation decay)

## Context

Tier-1 contracts needed reputation 0 or more, and a failed or cancelled contract takes reputation away. So one cancelled first contract left reputation at −3 and the board empty, for hundreds of days. Reputation decayed exponentially toward 0 and never reached it. The board said "a new one can come each day".

## Decision

1. **The first tier is open down to −20.** `CONTRACT_TIER_REPUTATION` is −20, 100, 300 (tiers 1, 2, 3). Tiers 2 and 3 are unchanged.
2. **Reputation settles at 0.** A decay step that leaves less than 0.5 either way sets it to 0 (`REPUTATION_SETTLE`). The exponential is otherwise unchanged.
3. **An empty board says why.** Below −20, the Offered list says the reputation, what the first contracts need, that reputation drifts back every month, and that a mission done raises it.

## Consequences

- A new agency can fail a few first contracts and still get offers. Below −20 it waits a few months, or flies a mission.
- The career-bot guardrails and the strategy projection are unchanged: they share the same decay function.
