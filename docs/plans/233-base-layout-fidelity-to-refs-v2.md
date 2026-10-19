---
id: 233
title: "Base layout, Flight and Space Center: match the v2 design package exactly"
status: draft
owner: ""
depends: [204, 215]
phase: 7
created: 2026-10-19
updated: 2026-10-19
---

# 233 — Base layout, Flight and Space Center: match the v2 design package exactly

## Goal

The time bar, menu bar and status bar look exactly as `refs/space-orbital-program-ui-v2/` draws them: same sizes, order, icons, type, colours and spacing. The extra top navigation bar from plan 204 is gone. Flight and the Space Center follow `FlightV2.dc.html` and `SpaceCenterV2.dc.html`. This is proved with screenshots placed side by side with the design at 1920 × 1080 and 1440 × 900.

## Context

- **Owner review, 2026-10-19:** the bell icon looks wrong, the status bar looks improvised, and a top navbar exists that was never asked for. Plan 204 was built without the design package, because the package was not in git.
- **Design:**
  - `refs/space-orbital-program-ui-v2/docs/BASE_LAYOUT.md` §1–6: sizes, zones, the icon paths of §6, and the bell at 26 × 26 with icon 14 and badge 8/700;
  - `docs/STYLE.md`;
  - `tokens/tokens.css` and `tokens/tokens.json`;
  - the sources `source/v2/Base.dc.html`, `FlightV2.dc.html` and `SpaceCenterV2.dc.html`, which are markup with inline styles and serve as the spec.
- **Code:**
  - `apps/web/src/routes/(world)/+layout.svelte`
  - `apps/web/src/lib/layout/WorldShell.svelte`, `status-bar.ts`, `layout-model.ts`, `regions.ts`
  - the flight page and `apps/web/src/lib/space-center/SpaceCenterOverlay.svelte`
- **ADRs:** 0222 point 1, 0201, 0107, 0205.

## Scope

**In:**
- The time bar: pause button 36 px; 8 warp segments sized 6 and 10 wide, 18 high; multiple label; T+.
- The menu bar: page actions | the fixed group, with a white icon and a 4 px dot on the active one | Menu.
- The status bar, 32 px with a border-top:
  - left: world name 11/700, mode chip, connection dot, location;
  - centre: Funds, Science, Rep, Contracts;
  - right: autosave, mods, the bell button with badge.
- The time-state chip and autosave text from ADR 0201, styled to fit the design.
- The icons replaced by the §6 paths.
- The top navbar removed; page actions moved into the menu bar.
- Content safe area: top 80, sides 24, bottom 56. Bottom panels at `bottom: 56px`.
- Flight v2 offsets per BASE_LAYOUT §5.
- Space Center v2: no top title; building dock at `bottom: 52`.

**Out:**
- The build menu (plan 235).
- New features.

## Touches

- **Size:** M
- **Edits:**
  - `apps/web/src/lib/layout/*`
  - `apps/web/src/routes/(world)/+layout.svelte`
  - the flight page and its HUD placement
  - `apps/web/src/lib/space-center/SpaceCenterOverlay.svelte`
  - `apps/web/src/lib/ui/icons*` (if present)
  - token CSS
- **Shared contracts:** none.

## Steps

1. Read the three `.dc.html` sources and `BASE_LAYOUT.md`. List every measurement in the plan's Log as a checklist.
2. Port the tokens from `tokens/tokens.css` that the shell uses: colours, glass, radius, type.
3. Rebuild the time bar, menu bar and status bar to the checklist, using the icon paths from §6. Remove the top navbar.
4. Apply the Flight v2 and Space Center v2 offsets.
5. Add a Chromium e2e, `e2e/base-layout.e2e.ts`. It measures the bar boxes (heights 44/44/32, margins 24, content insets 80/24/56), checks that the bell is 26 × 26 and that no element exists above the bars other than the time bar and menu bar, and saves screenshots at 1920 × 1080 and 1440 × 900.
6. Write a side-by-side review in the journal: our screenshot next to the design for Base, Flight and Space Center, with every remaining difference listed and fixed.

## Acceptance criteria

- [ ] `e2e/base-layout.e2e.ts` passes on Chromium. Its checks are listed in step 5.
- [ ] The `apps/web` vitest for `status-bar.ts` and `layout-model.ts` passes with the zones and order from BASE_LAYOUT §4.
- [ ] The journal has screenshots of ours next to the design for Base, Flight and Space Center, with an empty "remaining differences" list. `[manual]` The owner looks at them.
- [ ] `bun run check:affected` passes, and CI is green on `ready/233`.

## Docs checklist

- [ ] `docs/STATUS.md` updated.
- [ ] `docs/journal/233-base-layout-fidelity-to-refs-v2.md` written, with the screenshots.
- [ ] `docs/architecture/` notes on the shell updated.

## Log

- 2026-10-19 — Created from the owner's manual test (ADR 0222). The worker that built plan 204 does this right after its current plan, before anything else (owner's rule).
