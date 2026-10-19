---
id: 233
title: "Base layout, Flight and Space Center: match the v2 design package exactly"
status: done
owner: "Worker B (M5)"
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

- [x] `e2e/base-layout.e2e.ts` passes on Chromium. Its checks are listed in step 5.
- [x] The `apps/web` vitest for `status-bar.ts` and `layout-model.ts` passes with the zones and order from BASE_LAYOUT §4.
- [x] The journal has screenshots of ours next to the design for Base, Flight and Space Center, with an empty "remaining differences" list. `[manual]` The owner looks at them.
- [x] `bun run check:affected` passes, and CI is green on `ready/233`.

## Docs checklist

- [x] `docs/STATUS.md` updated.
- [x] `docs/journal/233-base-layout-fidelity-to-refs-v2.md` written, with the screenshots.
- [x] `docs/architecture/` notes on the shell updated.

## Log

- 2026-10-19 — Created from the owner's manual test (ADR 0222). The worker that built plan 204 does this right after its current plan, before anything else (owner's rule).
- 2026-10-19 — Worker B (M5) claimed it. Measurements from `BASE_LAYOUT.md` §1–6 and the inline styles of `Base.dc.html`, `FlightV2.dc.html` and `SpaceCenterV2.dc.html`, each checked in the code (`lib/layout/shell-model.ts` and the three bars) and, where it is a box, in `e2e/base-layout.e2e.ts`:
  - [x] time bar: left 24, top 24, height 44, radius 999, padding 4 14 4 4, gap 10; glass `rgba(22,23,26,0.6)`, `blur(28px) saturate(160%)`, border `rgba(255,255,255,0.08)` (e2e: 24/24/44)
  - [x] play 36 round `#F4F4F5`, icon 14 `#0B0B0C` (pause: two rects, play: a triangle)
  - [x] 8 segments, height 18, radius 3, gap 3, widths 6 6 6 6 10 10 10 10; up to the level `#F4F4F5`, the level accent, the rest `rgba(255,255,255,0.12)`, all dim while paused
  - [x] multiple 12/600 white, min-width 34, `1×`, `50×`, `1k×`, `—` paused; rule 1 × 18; time 12/500 `T+ 2y 70d 26:32`
  - [x] menu bar: right 24, top 24, padding 4, gap 4, rules 1 × 18 with margin 0 2 (the first only with page actions); buttons 36 round, icon 18, stroke 1.7; active white with a 4 px dot at bottom 3, others `#8B8B93`; Menu `#E4E4E7` (e2e: 24/24/44, fixed order Vessel · Map · Space Center · VAB)
  - [x] Flight page actions Panels · Vessel info · Navball · Crew · Change camera (FlightV2's paths; Change camera without a dot); Space Center page action Mission Center
  - [x] status bar: full width, height 32, border-top 1 px `rgba(255,255,255,0.08)`, padding 0 24, gap 14, 10 px `#A1A1AA`; rules 1 × 12 (e2e: 0/width/32 at the bottom)
  - [x] left: world 11/700 white, mode chip 16 high, padding 0 6, 8/700 letter-spacing 0.08em, `rgba(255,255,255,0.1)` `#E4E4E7`, system; connection dot 6 (accent, `#FF5A5F` offline), "Connected" 600 white, the network; location with a 12 px icon (stroke 1.9)
  - [x] centre `margin: 0 auto`, gap 16: Funds · Science · Reputation · Contracts "N active", values 600 white
  - [x] right: autosave and mods with 12 px icons, the tray `margin-right: -6px`; bell 26 × 26 radius 6 `#C4C4CC`, icon 14, badge right 1 top 2, min-width 12, height 12, padding 0 3, 8/700, `#F4F4F5` on `#0B0B0C` (e2e: 26 × 26)
  - [x] safe area top 80, sides 24, bottom 56 (e2e: Flight dock 80/24, staging 24/56, crew 24/56, navball bottom 56, vessel panel 80/24; Space Center column 80/24/320, dock bottom 52)
  - [x] nothing above the bars but the two bars; no title top centre (e2e)
  - [x] FlightV2 §5: staging and crew bottom 24 → 56, navball and the maneuver editor up 32 (they stand on the deck at bottom 56), vessel panel under the crew panel
- 2026-10-19 — Choices the design leaves open. What the old bars held that the design has no place for: the place's pause toggle (Settings → Time keeps it), Home (Menu → Main menu), the flight toolbar's Staging (staging always shows), Script (its dock tab) and Controls (F1 and the pause menu). The warp is picked by its segments; the keys still step it. The connection text comes from the comms snapshot: "Comms off" without a network, the stations, and the focused vessel's relays or "No signal" with its reason. T+ is the world's elapsed time in the world calendar's days and years, the mission time in Flight.
