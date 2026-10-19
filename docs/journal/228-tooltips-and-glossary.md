# 228 — Tooltip system and glossary

**Plan:** [plans/228-tooltips-and-glossary.md](../plans/228-tooltips-and-glossary.md) · **Session:** Worker D (MacBook Pro M2 13"), 2026-10-20 · **ADRs:** [0205](../decisions/0205-vessel-panel-v2-part-inspector-hud-layout.md) (the 10 px floor and the regions; no new ADR)

## What was done

| Where | What |
|---|---|
| `lib/ui/tooltip.ts` | Placement (above, below, beside; inside the viewport; off `data-tip-avoid` rectangles such as the navball) and a pure state machine: hover after 400 ms, focus at once, long-press after 500 ms, a 150 ms grace into the tooltip, Escape |
| `lib/ui/TooltipLayer.svelte` | The page's one tooltip in the root layout, for every `[data-tip]`; `data-tip-term` adds "More in the glossary"; `aria-describedby` while it shows; Escape closes it without reaching the page |
| all of `apps/web/src` | 112 native `title=` became `data-tip=` (including `Button`, `IconButton`, and 14 added by plans 223–236 during this plan); `TargetMarkers` sets `dataset.tip`; canvas and iframe stay on the allow-list |
| `lib/public/glossary.ts`, `routes/glossary` | 28 player entries (term, HUD abbreviation, short and long text, related); the page with search and anchors |
| `lib/ui/Term.svelte` | A focusable HUD term: the Orbit panel's terms, ALT, the radar chip, TWR |
| menu, help | Glossary links on the main menu and in the help overlay |
| tests | `ui/tooltip.test.ts` (9), `ui/tips.test.ts` (4: the `title=` scan, term coverage, search, the developer glossary list), old `title=` assertions moved to `data-tip=`; `e2e/tooltips.e2e.ts` |

## What surprised me

- **Escape went through.** Closing a tooltip with Escape also opened the flight's pause menu, and the e2e caught it when the menu blocked the next hover. The tooltip layer now stops the key when it closes one.
- **The scan caught the converter.** The first pass missed a `title=` inside a tag with `i < index` in an expression, and the allow-list test failed on it. The second pass skips `<` inside `{…}`.
- **The tree moved under the plan.** Plan 233 replaced the app bar, warp control and world capsule while this plan converted them, and other plans added 14 more `title=`. After the rebase the scan test listed them, and the same converter fixed them.
- The Orbit panel is the dock's default, so the e2e opens it only when it is closed (a click closes it).

## Verification output

```
cd apps/web && bunx vitest run src/lib/ui src/lib/hud src/lib/public src/lib/layout   200+ passed
bun run lint                                                                        OK
bun run check:affected                                                              ✓ prettier ✓ docs ✓ typecheck (web) ✓ web vitest 91/91
E2E_PORT=5262 bunx playwright test e2e/tooltips.e2e.ts --project=chromium          1 passed
WebKit long-press e2e: not run (worker brief: Chromium only on this machine; long-press covered by tooltip.test.ts)
```
