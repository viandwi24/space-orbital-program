# 271 — The backup reminder's glass card

**Plan:** [plans/271-backup-reminder-glass-card.md](../plans/271-backup-reminder-glass-card.md) · **Session:** backup-reminder session, 2026-10-21

## Root cause (measured)

On `/vab` at 1440 × 900 with a due reminder, the computed style of `[data-testid=backup-prompt]` was:

```
before: background rgba(22, 23, 26, 0.6) · backdrop-filter none
after:  background rgba(22, 23, 26, 0.6) · backdrop-filter blur(28px) saturate(1.6) brightness(0.4)
contrast / blur off: background rgb(20, 21, 24) · backdrop-filter none
```

The card is at x 407, y 803, 625 × 41 px, right on the Hangar's tool bar. With the glass colour and no filter, the bar's labels showed through.

## What was done

| Where | What |
|---|---|
| `apps/web/src/routes/(world)/+layout.svelte` | `.backup` gets `backdrop-filter: var(--glass-filter)`, as `Toasts.svelte` has |

## Verification

- Headless Chromium (Playwright 1.64.1) against `vite dev`, reminder state seeded in local storage. Screenshots of the bottom 240 px:
  - before on `/vab`: the bar's ×2…×8, Mirror, Snap, CoM, CoT and Contrast show through the text.
  - after on `/vab`: the bar under the card is a dark blur, and the text and buttons read cleanly.
  - after with high contrast and with blur off: the card is solid.
  - after on `/space-center` and `/flight`: the card is clean. The Space Center's build bar is blurred under it.
- `bun run typecheck`: 0 errors, 0 warnings (2069 files).
- `CI=true` web vitest: 188 files passed, 1 failed, 1341 tests passed. The two failures are in `sim-host-script-worker.test.ts`, the known local failure (STATUS, journal 225).
- `bun run lint`: this file passes `prettier --check`. The run itself is red on three files that other open sessions are editing (`map-stack.test.ts`, `MapPickList.svelte`, `space-center/model.test.ts`), not on this change.

## What surprised me

Nothing in the layout was wrong. The reminder kept the glass colour but lost its filter. `.script-sign` and `.savenote` in the same file are missing it too (follow-up).
