---
id: 290
title: "A folded part row in the vessel panel does not open when its summary is clicked"
status: done
owner: "part-row fold session"
depends: [256, 272]
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 290 — A folded part row in the vessel panel does not open when its summary is clicked

**Size:** S

## Goal

Found while verifying UI v3's e2e (plan 272): in flight, in the vessel panel's Parts tab, a click on a folded part row's summary leaves the row folded (`details.open === false` 1.5 s later), by `summary.click()` and by a real mouse click. It reproduces on main before and after v3. `power.e2e.ts` and `vessel-panel.e2e.ts` ("toggle the landing legs") fail because `[data-testid$="-setDeployed"]` stays hidden in the folded row. A click opens the row, and both e2e pass.

## Context

- `apps/web/src/lib/vessel-panel/VesselPanel.svelte`: the category and part `<details>` (plan 256), `open={openRows.isOpen(…)}` and `ontoggle={… openRows.set(…)}`.
- `apps/web/src/lib/vessel-panel/open-rows.svelte.ts`, `part-summary.ts` (`isOpenRow`, `withRow`).
- `apps/web/e2e/support.ts` `openDock(page, 'host.parts')` unfolds the rows by their summaries.

## Scope

**In:** the cause, the fix in the component, `openDock`'s unfolding, the two e2e on Chromium against the production build.
**Out:** the other e2e of plan 272.

## Steps

1. Instrument `HTMLDetailsElement.prototype.open`, `toggle` and `click` in a throwaway e2e and click a folded summary.
2. Fix the component.
3. Make `openDock` unfold all rows in one page call (one Playwright click per row takes about 8 s in a software-rendered flight).
4. Run `power.e2e.ts` and `vessel-panel.e2e.ts` on Chromium against the production build.

## Acceptance criteria

- [x] The cause is found and recorded (journal): Svelte puts a row's `open={…}` in the same template effect as its summary text (`sum.text`, `sum.tone`), which changes every tick in flight, so the effect writes `details.open` from the store dozens of times a second. The click opened the row, the next run wrote `open = false` back before the async `toggle` event fired, and that event then stored "folded".
- [x] A click on a summary flips the stored state itself (`flipRow`, with `preventDefault`), so `open` follows the store; `ontoggle` stays for other ways a row opens. The category headings get the same.
- [x] `openDock(page, 'host.parts')` clicks every folded summary in one `evaluateAll` call and expects none left folded.
- [x] The throwaway e2e shows one `toggle` with `open` true and the row still open 1.5 s later (journal).
- [x] `power.e2e.ts` and `vessel-panel.e2e.ts` pass on Chromium against the production build (journal).
- [x] `bun run docs:check`, `bun test`, `bun run typecheck`, `bun run build` pass (journal).

No vitest: the cause is the component's effect timing, not pure code (`isOpenRow` and `withRow` were right and are tested in `part-summary.test.ts`).

## Docs checklist

- [x] Plan, STATUS row and journal entry, journal.

## Log

- 2026-10-21: Created and done by the part-row fold session, started from the UI v3 session.
