---
id: 262
title: "Throttle climbs back to 100 % by itself in the Landing lesson, even after X"
status: ready
owner: "Worker C"
depends: []
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 262 — Throttle climbs back to 100 % by itself in the Landing lesson, even after X

**Size:** S

## Goal

Throttle only changes when the player (or the player's own script) changes it. Item 23 of `docs/reviews/2026-10-20-owner-manual-test.md` (`20.webp`).

## Context

- **What the owner saw** (Pages build after plans 255–260): in the Landing lesson, Touch down step (4 of 4), the throttle rises from 0 to 100 % again and again. Pressing X does not stop it.
- **Candidates to check:**
  - plan 257's throttle resend and reconcile (`flight-loop.ts`, `sentThrottle` reset on refusal, reconcile against the snapshot), which may fight the HUD value in a loop;
  - a lesson assist in `apps/web/src/lib/onboarding/lessons.ts` (plan 229) that sets the throttle;
  - plan 253's governor or 247's warp stops resetting the HUD's throttle;
  - plan 245's key handling (X = cut).

## Scope

**In:**
- Find the root cause, fix it, and add a unit test that reproduces the loop: throttle set to 0, nothing raises it again.

**Out:**
- Nothing else.

## Steps

1. Reproduce in a unit test (flight-loop with a fake client, or the lesson model).
2. Fix the cause.
3. Run the affected unit tests and the typecheck, then merge first.

## Acceptance criteria

- [ ] The root cause is in the journal. A unit test fails before the fix and passes after it.
- [ ] Throttle stays where the player put it in the Landing lesson and in normal flight.
- [ ] Affected unit tests and the typecheck pass. E2E is paused by the owner.

## Docs checklist

- [ ] STATUS row.
- [ ] Journal.

## Log

- 2026-10-21 — Created by the coordinator from the owner's report.
