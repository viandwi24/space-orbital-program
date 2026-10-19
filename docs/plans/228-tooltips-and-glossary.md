---
id: 228
title: Tooltip system and glossary
status: done
owner: "Worker D"
depends: [215]
phase: 7
created: 2026-10-18
updated: 2026-10-20
---

# 228 — Tooltip system and glossary

## Goal

Every HUD term explains itself. A tooltip component replaces native `title=` attributes: it shows on hover, focus and long-press, places itself inside the HUD regions from plan 215, and can link to a glossary entry. A glossary page lists every term the HUD uses and is reachable from the HUD, the help overlay and the menu.

## Context

- rancangan §11.7 (tooltip system on every HUD term, and a glossary; today only `title=`).
- Research 15b §1d: tooltips are native `title=` only (147 uses), plus key hints on `IconButton` (`apps/web/src/lib/ui/IconButton.svelte:7,13`); no tooltip component; no manual or knowledge base. Help overlay on F1 or `?` (`apps/web/src/lib/hud/HelpOverlay.svelte`).
- The developer glossary already exists in `docs/product/glossary.md`. The player glossary is a separate, shorter data file in the game, kept in sync by a test.
- ADRs: 0205 (HUD layout spec: regions, 10 px text floor, toast placement). No new ADR is needed: the tooltip is a component, not a decision.
- Plan 215 defines the HUD regions the tooltip must stay inside.

## Scope

**In:**
- `Tooltip` component and a `tooltip` action: hover after 400 ms, keyboard focus at once, long-press on touch; Escape closes; `aria-describedby` wiring; text at least 10 px at every UI scale.
- Placement that stays inside the viewport and never covers the navball (plan 215 rule).
- Term tooltips: a short definition plus "More in the glossary" for terms with an entry.
- Replace `title=` across `apps/web/src` with the component, except on elements where the browser tooltip is the only option (canvas, iframe).
- Player glossary data (term, short text, long text, related terms) and a `/glossary` route with search and anchors.
- Entry points: a Glossary link in the help overlay, the menu, and each term tooltip.
- Every term in the HUD (Ap, Pe, TWR, Δv, Isp, SOI, MET, AN/DN, prograde, normal, radial, Q, Mach, EC and others) has an entry.

**Out:** a full manual. Localisation (P2; strings are keyed so it can come later). Video or diagram content.

## Touches

- **Size:** M
- **Edits:**
  - `apps/web/src/lib/ui/` (new `Tooltip.svelte` and the action), `apps/web/src/lib/ui/IconButton.svelte`
  - `apps/web/src/lib/hud/` (term tooltips on read-outs), `apps/web/src/lib/hud/HelpOverlay.svelte`
  - `apps/web/src/routes/` (new `glossary/` route), `apps/web/src/lib/public/` (glossary data)
  - `apps/web/e2e/tooltips.e2e.ts` (new)
- **Shared contracts:** none.

## Design notes

- One tooltip instance per page, positioned by the hovered element's rect. This avoids hundreds of hidden nodes.
- A lint-style vitest scans `apps/web/src` for `title=` and fails on new uses outside an allow-list.

## Steps

1. Tooltip component and action with placement and accessibility.
2. Replace `title=` uses; allow-list the exceptions.
3. Player glossary data and the `/glossary` route.
4. Term tooltips on HUD read-outs linking to entries.
5. Entry points in help and menu.
6. Chromium e2e and a WebKit run for long-press.

## Acceptance criteria

E2E setup uses the plan 203 debug API (ADR 0200). This plan does not depend on 203; if 203 is not done yet, set up with `launchTwoStage` and `runScript` from `apps/web/e2e/support.ts` and record that in the Log.

- [x] `apps/web` vitest: `ui/tooltip.test.ts` covers hover delay, focus, Escape and placement inside a 1024 × 768 viewport.
- [x] `apps/web` vitest: the `title=` scan finds no uses outside the allow-list.
- [x] `apps/web` vitest: every term id referenced by a HUD tooltip exists in the glossary data, and every glossary entry has a short text under 140 characters.
- [x] Chromium e2e `apps/web/e2e/tooltips.e2e.ts`: `debug.setOrbit` (plan 203) to low orbit; focus the Ap read-out with Tab; the tooltip text contains "Apoapsis"; its "More" link opens `/glossary#apoapsis`; the glossary search for "TWR" shows one entry.
- [ ] The same e2e passes on WebKit (`--project=webkit`) with a long-press: not run here (worker brief: Chromium only on the M2); long-press is covered by `tooltip.test.ts`; left to release QA (plan 232).
- [x] `bun run check:affected --build --e2e e2e/tooltips.e2e.ts` passes (check:affected green; the e2e run on its own: 1 passed).
- [x] CI is green on the `ready/*` tag for this plan (`refs/ci/pass/3454f1fd`).

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/228-tooltips-and-glossary.md` written.
- [x] `docs/product/glossary.md` notes the player glossary file and how they stay in sync.
- [x] `docs/product/visual-direction.md` describes the tooltip look.

## Log

- 2026-10-20 — Worker D: rebased over plans 218–236 (14 more `title=` converted; HelpOverlay keeps the lessons link beside the glossary one); CI green on `ready/228`; done.
- 2026-10-20 — Worker D: claimed (claim/228) and built.
  - **The tooltip:** `ui/tooltip.ts` (placement and a pure state machine) and `ui/TooltipLayer.svelte`, one per page in the root layout, for every `[data-tip]` (`data-tip-term` links to the glossary).
  - **`title=` replaced:** 98 uses on native elements, `Button` and `IconButton` became `data-tip=`, and `TargetMarkers` sets `dataset.tip`. The allow-list keeps canvas and iframe.
  - **Accessibility:** the icon-only buttons all have an `aria-label`, so no accessible name was lost.
  - **The player glossary** (`lib/public/glossary.ts`, 28 entries), `/glossary` with search and anchors, and `ui/Term.svelte` on the Orbit panel's terms, ALT, the radar chip and TWR.
  - **Links:** the Glossary link in the menu and the help overlay.
  - **Found while testing:** Escape that closed a tooltip also opened the flight's pause menu; the layer now stops the key when it closes one.
  - **Docs:** the developer glossary lists the player entries, kept in sync by `ui/tips.test.ts`.
  - **WebKit long-press e2e:** not run. The worker brief keeps Playwright to Chromium on this M2; the long-press logic is covered by `tooltip.test.ts`, and the WebKit run is left to release QA (plan 232).
  - **Run on battery** at the owner's word (2026-10-20).

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
