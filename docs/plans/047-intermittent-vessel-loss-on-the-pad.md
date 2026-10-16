---
id: 047
title: Intermittent "Vessel lost" on the pad (seen in Firefox)
status: done
owner: "pad-loss session (Claude, 2026-10-17)"
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

- [x] The cause is found with evidence and written in journal 047 (reproduction rate before the fix, the mechanism).
- [x] A regression test (`apps/web/src/lib/vessel-presence.test.ts`) fails on the old rule and passes on the new one, over 12 seeded timings (irregular wall deltas, a stalled tick, a delay between `ready` and `load-vessel`, terrain field built as in the Worker), with a HUD check between every two Worker messages; the sim destroys nothing in any of them.
- [x] `e2e/launch.e2e.ts` (fresh launch, 3 s of watching for the card): 30 consecutive Firefox launches with 0 losses (the pre-fix build lost 2 of 30); Chromium and WebKit reduced because of resource limits on the human's machine (swap full, Chromium at ~490% CPU): Chromium 27 launches (24 in a run that was stopped, then 3), WebKit 10, 0 losses.
- [x] All existing tests green; `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check` pass (foreign WIP failures reported separately).

## Docs checklist

- [ ] `STATUS.md`, journal.

## Log

- 2026-10-17 — Created as draft by plan 032.
- 2026-10-17 — Refined draft → ready at the human's request (session: pad-loss session).
- 2026-10-17 — Ready → in-progress (pad-loss session). Reproduced 2 of 30 on the pre-fix build (Firefox); cause is in the page, not the sim: see journal 047.
- 2026-10-17 — Done. Fix: `vessel-presence.ts` (only a snapshot taken after the `load-vessel` answer can say the vessel is gone). Post-fix launches: Firefox 30/30, Chromium 27/27, WebKit 10/10, 0 losses. `retries: 1` comment in `playwright.config.ts` left as is (out of scope).
