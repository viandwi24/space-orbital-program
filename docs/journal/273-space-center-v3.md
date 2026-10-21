# 273 — Space Center v3: Overview, Build and Focus

**Plan:** [plans/273-space-center-v3-modes.md](../plans/273-space-center-v3-modes.md) · **ADR:** [0254](../decisions/0254-space-center-modes-and-context-bar.md) · **Session:** ui-v3 session (Claude, M5), 2026-10-21

## What was done

| Where | What |
|---|---|
| `space-center/sc-mode.ts` | The pure rules, covered by vitest: the mode from (build open, selected); previous and next with wrap; "Building i of n"; the card chips LOCKED and ×n |
| `SpaceCenterOverlay.svelte` | One context bar at bottom 52. **Overview:** Build · Buildings · Found a branch │ Labels. **Build:** the build bar. **Focus:** ← Overview │ ‹ name · Building i of n ›. The Buildings list (280, top 80) holds the site picker, the rows, the attention lines, Flows and Market; it stays mounted while closed, so its state and ids remain. The v3 detail panel (320). A demolish confirm sits at the pin. Escape steps back a level |
| `BuildMenu.svelte` | The build bar, 1040 at most: BUILD, the category tabs, Place and Demolish, then Done. The cards have a thumbnail, a chip, the name and the facts. While placing, the placement chip replaces the cards; with Demolish, a hint does |

The pins and their positions belong to plans 259 and 267 and are untouched. The pin only gets a red tag ("Demolish X") while the bulldozer is out.

## Screens

At 1440 × 900 unless noted, Chromium (`e2e/v3-screens.e2e.ts`), in a new Career world:
- before: `assets/273-sc-before-overview.jpg`, `assets/273-sc-before-focus.jpg`;
- after: `assets/273-sc-overview.jpg`, `assets/273-sc-buildings.jpg`, `assets/273-sc-build.jpg`, `assets/273-sc-demolish.jpg`, `assets/273-sc-focus.jpg`, `assets/273-sc-focus-1280.jpg` (1280 × 800).

## Differences left on purpose (ADR 0254)

- **The placement chip** sits in the build bar, not over the ghost. Our ghost follows the pointer over real terrain and a click places it.
- **No red tint** on the 3D building while demolishing. The pin's tag turns red instead; the tint is draft 274.
- **Focus zoom:** Focus frames the building with the existing `setSiteFocus` (160 m). There is no 1.6–3× zoom animation of its own.
- **The refund line** of the confirm is left out: the sim gives no refund.

## Checks

- vitest `space-center`: 29 of 29 pass, including `sc-mode.test.ts` and the updated `model.test.ts` (the panel's `sc-demolish` replaces `sc-frame`).
- The e2e tests `space-center`, `build-menu`, `branch-sites` and `base-layout` now open the build bar (`sc-build`) and the Buildings list (`sc-buildings`) where they need them. The run is in plan 272's Log.
