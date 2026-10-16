---
id: 047
title: Intermittent "Vessel lost" on the pad (seen in Firefox)
status: draft
owner: ""
depends: [032]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 047 — Intermittent "Vessel lost" on the pad

## Goal

Find and fix why a freshly launched two-stage vessel is sometimes destroyed before anything acts on it.

## Context

- Found by the plan 032 end-to-end suite: in Playwright's Firefox (157.0), about 1 launch in 12 ends with the HUD card "Vessel lost: the vessel was destroyed" and the script panel's Run button never enabling (the flight status never becomes `flying`). Seen twice (the orbit test once, the warp smoke test once), then in 1 of 16 repeated smoke runs, with the page text captured by `e2e/support.ts`. Not seen in 8 of 8 repeated warp tests, nor in the Chromium and WebKit runs (about 8 flights each, too few to say it cannot happen there).
- Not reproduced headlessly: `bun`/vitest sim with 12 runs of irregular wall deltas (0.016 to 0.1 s) on the pad showed no damage event. The working tree at the time included other sessions' uncommitted terrain (plans 031/039) and SAS (042) sim changes, so a regression from those is possible; the cause is not established.
- Read: `architecture/simulation.md` (ground contact, ADR 0019, ADR 0043 terrain), journal 032.

## Scope

**In:** capture the destroying event (`vessel:destroyed` reason, `part:damaged` speed and cause) in the failing case (the e2e failure dump could include the sim-event toasts), reproduce with a stalled first frame (Firefox starts the Worker and renders in software at the same time), fix the cause. **Out:** changing the e2e retry.

## Steps

1. Reproduce (repeat `bun run e2e -- --project firefox --repeat-each 20`), find the event, fix, add a unit test.

## Acceptance criteria

- [ ] To be written when refined.

## Docs checklist

- [ ] `STATUS.md`, journal.

## Log

- 2026-10-17 — Created as draft by plan 032.
