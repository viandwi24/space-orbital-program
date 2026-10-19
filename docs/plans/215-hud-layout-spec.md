---
id: 215
title: HUD layout spec and stable camera framing
status: in-progress
owner: "Worker B"
depends: [204]
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 215 — HUD layout spec and stable camera framing

## Goal

Every flight HUD region has a minimum, default and maximum width, a bounded height that scrolls inside, and a defined behaviour at 1440, 1280 and 1024 px. Toasts are capped at four, sit under the menu bar and never cover the navball. Text never drops below 10 px at any UI scale. Opening or closing a side panel no longer moves the vessel on screen: side panels float over the scene, and the camera keeps one constant vertical offset computed from the bars that are always there.

## Context

- Rancangan §7.5 (region table and width rules), §7.6c (camera jumps when a panel opens), §7.6 (literal px and colours outside tokens).
- ADRs: 0205 (HUD layout spec, "side panels do not move the camera"), 0201 (Base layout shell from plan 204), 0107 and 0140 (tokens, 10 px floor, UI scale), 0144 (navball module width).
- Research:
  - 05 §4.2 and §4.3: region sizes today and how they collide at 1440, 1280 and 1024; staging, crew, `.mnv` and toasts have no max-height; the capsule row has no max-width.
  - 05 §4.4: unbounded heights, throttle over staging (`apps/web/src/lib/layout/layout-model.ts:44-60`), the vessel panel replacing the dock, text under 10 px at scale 0.8 and 0.9, navball labels in px (`apps/web/src/lib/hud/navball-draw.ts:142,168`), toasts without a count limit (`apps/web/src/lib/ui/Toasts.svelte:34-35`).
  - Rancangan §7.6c and 15b §1a: the view offset moves the image centre to the free rectangle (`packages/renderer/src/scene.ts:766-779`); insets come from the panels (`apps/web/src/routes/flight/+page.svelte:606-624`), so toggling a side panel shifts the rocket by 150–200 px at once.
  - 04 §6.2: the layout spec this follows.
- Depends on 204 (time bar, menu bar and status bar exist as the shared Base layout).

## Scope

**In:**
- One layout table in code (`apps/web/src/lib/layout/regions.ts`) holding the rancangan §7.5 numbers: dock 260–280–400, vessel panel 300–340–440, navball 390 × 262 fixed, staging 200–220–280 with a max height, crew max 3 rows, toasts max 4.
- Breakpoints: ≥ 1440 two side panels at once; < 1280 one side panel (opening one closes the other); ≤ 1024 drawers and 44 px touch targets.
- Bottom panels at `bottom: 56px` (Base v2 status bar).
- Max heights with inner scroll for staging, crew, maneuver editor, toast column; max width for the top capsule row with wrap.
- 10 px floor: `--t-label` and friends clamp to 10 px at every scale; navball canvas labels scale with UI scale and clamp.
- Camera: side insets are 0 by default; vertical offset constant from the time bar, navball module and status bar heights; any future change animates over 250 ms and respects reduced motion. Setting "Centre the vessel in the free area" (default off) restores side insets with the same smooth transition.
- Throttle anchor respects staging; vessel panel no longer removes the dock at ≥ 1280.
- Colour and px leftovers listed in 05 §4.4 items 6 and 7 replaced with tokens.

**Out:**
- The vessel panel's own content and resize handle (plan 214; this plan only supplies the region limits).
- Tooltips (plan 228).
- UI scale above 150 % (P1, rancangan §12.3).

## Touches

- **Size:** M
- **Edits:**
  - new `apps/web/src/lib/layout/regions.ts` and test; `apps/web/src/lib/layout/layout-model.ts`
  - `apps/web/src/routes/flight/+page.svelte` (region CSS, `updateInsets`)
  - `apps/web/src/lib/ui/Toasts.svelte`, `apps/web/src/lib/ui/tokens.css`, `apps/web/src/lib/ui/base.css`
  - `apps/web/src/lib/dock/Dock.svelte`, `apps/web/src/lib/hud/StageStack.svelte`, `apps/web/src/lib/hud/CrewPanel.svelte`, `apps/web/src/lib/hud/navball-draw.ts`, `apps/web/src/lib/hud/Navball.svelte`
  - `packages/renderer/src/scene.ts` (`setViewInsets` gains a smooth transition)
  - `apps/web/src/lib/settings/settings.ts`, `apps/web/src/lib/ui/SettingsDialog.svelte` (centre option)
- **Shared contracts:** `regions.ts` exports the limits that 214 (panel width), 218 (Hangar columns) and 228 (tooltip placement) read. `Renderer.setViewInsets` keeps its signature; it gains an optional `{ animate: boolean }`.

## Design notes

- The insets function returns `{ top, bottom }` from fixed bars only; `left` and `right` are 0 unless the centre option is on.
- Breakpoints use CSS px on the viewport, but region widths use rem so they scale; at 125 % and 150 % the layout drops to the next breakpoint when the scaled sum does not fit. This is the fix for 05 §4.3 "UI scale other than 1".
- Toast overflow: the oldest non-error toast leaves first; errors stay until dismissed.

## Steps

1. `regions.ts` with the table and a pure `layoutFor(viewport, uiScale, open)` returning sizes and which panels may be open. Tests.
2. Apply limits and inner scroll in the flight page and components.
3. Toast cap and placement under the menu bar.
4. 10 px floor in tokens and navball canvas.
5. Camera: constant vertical inset, zero side insets, smooth transition, settings option.
6. Token and px clean-up from 05 §4.4 items 6 and 7.
7. Playwright layout checks at three widths.

## Acceptance criteria

- [ ] `apps/web` vitest `lib/layout/regions.test.ts`: at 1440 × 900 both side panels may be open; at 1279 opening the vessel panel closes the dock; at 1024 both are drawers; at scale 1.25 and 1440 px the layout drops to the one-panel rule.
- [ ] `apps/web` vitest `lib/ui/tokens.test.ts` asserts every type token is at least 10 px at scales 0.8 through 1.5.
- [ ] Chromium e2e `e2e/hud-layout.e2e.ts` at 1440 × 900, 1280 × 800 and 1024 × 768: no two HUD regions overlap (bounding boxes); the staging stack with 6 stages scrolls inside; at most 4 toasts are visible after `window.__orbitalDebug.log` pushes 6 warnings.
- [ ] Chromium e2e `e2e/hud-layout.e2e.ts` camera case: the projected screen position of the vessel root (read through `window.__orbitalDebug`) moves by less than 2 px when the vessel panel opens and closes.
- [ ] `e2e/ui-scale.e2e.ts` still passes on Chromium.
- [ ] `bun run check:affected` passes.
- [ ] CI is green on the plan's ready tag (full suite, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/215-hud-layout-spec.md` written, with screenshots at the three widths.
- [ ] `docs/architecture/overview.md` updated (layout regions and camera framing).
- [ ] `docs/product/visual-direction.md` updated if a deviation from the refs is recorded.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-19 — Worker B. Between 1280 and 1439 px both side panels stay allowed, as before (the ADR names ≥ 1440 and < 1280; the band between keeps today's two-panel layout). "Bottom panels at 56 px" holds through the world shell since plan 204: the flight box ends above the status bar, so a 24 px margin inside it is 48 px plus the bar. Drawer mode is the one-panel rule plus 44 px targets in the side panels, not a sliding drawer. The toast cap was already four; past it the oldest non-error toast now leaves first, errors still expire on their timer (dismissing is plan 228's tooltip and notice work). The vessel panel takes its 340 px default width; its resize handle is plan 214's. The touch throttle stands above a staging stack in the left column, or beside it when the room above is shorter than its smallest track. Debug API: `toast` and `vesselOnScreen` (through `flightDebug`, filled by the flight page). The journal's screenshots are taken at the three widths with the vessel panel open.
