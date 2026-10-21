# 0254 — Space Center: Overview, Build and Focus modes with one context bar

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/273-space-center-v3-modes.md
**Supersedes in part:** ADR 0244 point 4 (the right column with everything at once)
**Builds on:** ADR 0244 points 1–3 (pins, the building panel, framing), ADR 0227 (the build menu), ADR 0251 (pins on their anchors); design `refs/space-orbital-program-ui-v3` (V3_CHANGES §1)

## Context

The v3 design gives the Space Center a page system. It keeps the campus clean, and a bar at the bottom centre shows only what the current mode needs. The app showed the site picker, the building panel, the list, Flows and Market at once in a right column, with the build menu under the campus.

## Decision

1. **The mode follows two pieces of state.** It is **Build** while the build bar is open. Otherwise it is **Focus** when a building is selected and **Overview** when none is. The rule is pure (`sc-mode.ts`). Escape steps back: Build → Overview and Focus → Overview. A ghost being placed is cleared first.
2. **Overview.** The context bar holds Build · Buildings · Found a branch │ Labels (the tag icon, which is the ADR 0244 "Names" switch: on hover, or always). **Buildings** toggles a 280-wide list at the right:
   - the site picker, when there are several sites;
   - the rows (hover shows the name in the scene; a click opens Focus);
   - the "needs attention" lines;
   - Flows and Market, when they exist.
3. **Build.** The build bar is 1040 wide at most, and narrower windows fit it to the safe area. Its first row: BUILD, the category tabs of the build menu (ADR 0227), the tools Place and Demolish, then Done. With **Place**, its second row holds the cards (chip BUILT / LOCKED / ×n, name, and cost · days · tiles). A picked card makes the ghost follow the pointer; a click places it, as before. A placement chip (name, the check's reason, Rotate, Cancel) replaces the cards row while placing. With **Demolish**, the second row says "Click a building to remove it". A click on a pin opens a confirm popover at the pin: "Demolish X? This can't be undone." with Cancel and Demolish.
4. **Focus.** Selecting a building frames the camera on it (ADR 0244 point 3). The detail panel (320, top 80, right 24) shows:
   - the name;
   - the level bar and "Level n of m";
   - the status dot;
   - the description;
   - Provides and Upkeep;
   - the "Next · Level n" box with Upgrade;
   - the Open action;
   - Demolish, through the same confirm.

   The context bar becomes `← Overview │ ‹ name · Building i of n ›`, and Escape or the panel's × also returns to Overview. (The design also returns on the menu bar's Space Center icon; the shell has no hook for that yet: draft 274.)

## Alternatives considered

- **A chip fixed above the ghost with a Place button** (as drawn). Not now: our ghost follows the pointer on real terrain and a click places it. The chip would chase the pointer. It sits in the build bar instead.
- **A red tint on the hovered 3D building in Demolish.** Left to draft 274: it needs a renderer hook. The pin's tag turns red and reads "Demolish X".

## Consequences

- The e2e ids (`sc-label-*`, `sc-detail`, `sc-open`, `sc-upgrade`, `sc-attention`, `sc-list`, `sc-site`, `sc-found-branch`, `sc-labels`, `sc-ghost`, `sc-rotate`, `sc-build-stop`) are kept. `sc-attention`, `sc-list` and `sc-site` are inside the Buildings list, so the tests open it first (`sc-buildings`). `sc-remove` is now the confirm's Demolish button. `sc-build` opens the build bar.
