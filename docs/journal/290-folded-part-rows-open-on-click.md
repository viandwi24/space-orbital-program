# 290 — Folded part rows that did not open on a click

**Plan:** [plans/290-folded-part-rows-open-on-click.md](../plans/290-folded-part-rows-open-on-click.md) · **Session:** part-row fold session, 2026-10-21, in its own worktree off `origin/main` 68c20b61

## Root cause (measured)

A throwaway e2e on the dev server patched `HTMLDetailsElement.prototype.open`'s setter to log its stack, logged `toggle` and `click` in the capture phase, then clicked the first folded `summary[data-testid$="-row"]` in `host.parts`. Before the fix the log was dozens of lines per second of:

```
DIAG set open=false  at VesselPanel.svelte:1443 | runtime … update_reaction | update_effect
DIAG set open=true   at VesselPanel.svelte:1486 | runtime … update_reaction | update_effect
```

Svelte 5 compiles a fragment's dynamic attributes and text into one template effect. The part row's `open={openRows.isOpen(…)}` shares its effect with the summary's `sum.text` and `sum.tone` (`partSummary(p)`), which change every tick in flight (fuel, charge, temperature), so the effect re-runs and writes `details.open` from the store each time. A click opens the row natively, but `toggle` is fired asynchronously; the next effect run writes `open = false` first, and the `toggle` event that follows reads `false` and stores "folded". Nothing on the HUD layer or the tooltip layer was involved: the click reached the summary with `defaultPrevented` false. The category headings had the same race (their default is open, so they could not be folded in flight).

## What was done

| Where | What |
|---|---|
| `apps/web/src/lib/vessel-panel/VesselPanel.svelte` | `flipRow(e, key, fallback)`: a summary click calls `preventDefault()` and flips the stored state, so `open` only ever follows the store; on the part rows and the category headings. `ontoggle` stays for other ways a row opens. |
| `apps/web/e2e/support.ts` | `openDock(page, 'host.parts')` clicks the folded summaries in one page call and expects none left |
| docs | plan 290, STATUS row |

No vitest: `isOpenRow` and `withRow` were right (and are covered by `part-summary.test.ts`); the fault was the effect timing in the component.

## Verification

- The throwaway e2e after the fix (dev server, Chromium):

```
clicking part-1-row
DIAG click capture on SPAN prevented=false
DIAG click bubble window prevented=true
DIAG toggle true part-1-row
open after true
```

- `power.e2e.ts` and `vessel-panel.e2e.ts`, Chromium, production build (`vite preview`), under the heavy-job lock with `nice`:

```
✓ power.e2e.ts › a probe charges by day, not at night, and at zero charge it is uncontrolled (2.4m)
✓ vessel-panel.e2e.ts › toggle the landing legs from the Parts tab (58.4s)
✓ vessel-panel.e2e.ts › panel width and resize; click the engine to inspect it and type its limiter (1.7m)
3 passed (5.2m)
```

- The first run with the fix alone still failed both: the rows now opened, but `openDock` clicked them one at a time and the trace shows each Playwright click taking 7 to 10 s on the busy software-rendered flight (18 rows ate the 3-minute test budget). `openDock` now clicks every folded summary in one `evaluateAll` call (`HTMLElement.click()` on the summary, through the same `onclick`) and expects none left folded.

- Commands, in this session's worktree, under the heavy-job lock:
  - `bun run docs:check`: OK (210 plans, 231 ADRs).
  - `bun run test`: 2085 pass, 0 fail.
  - `bun run typecheck`: 0 errors (svelte-check: 2073 files, 0 errors, 0 warnings).
  - `bun run build`: done.
  - `CI=true bunx vitest run src/lib/vessel-panel` in `apps/web`: 16 passed.
- A bare `bun test` at the root also sweeps `apps/web`'s vitest files (99 fail there, and it rewrites `trajectory-golden.test.ts.snap`); `bun run test` is the project's command. The snapshot was restored.

## Surprises

- `power.e2e.ts` and `vessel-panel.e2e.ts` were red on main before UI v3 as well; plan 272's `openDock` helper unfolds rows by their summaries, the way a player does, which is what exposed it.
