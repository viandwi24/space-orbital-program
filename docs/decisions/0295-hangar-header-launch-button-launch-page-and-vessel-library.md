# 0295 — Hangar header beside the time bar, LAUNCH above Vessel, a Launch page with a hero, and a vessel library

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/346-hangar-header-launch-page-vessel-library.md
**Supersedes in part:** ADR 0253 (Launch as the menu bar's primary action in the Hangar); ADR 0150 (the Launch screen's three plain columns)
**Builds on:** ADR 0041 (the vessel library), plan 285 (blueprint library), plan 318 (recover and terminate), plan 341 (crew portraits)

## Context

The owner found the Hangar's name capsule and the Launch icon far from where the eye goes, and the Launch page plain. Its vessel list repeats the same design many times, because each save from a blueprint or a copy makes a new record.

## Decision

1. **The shell gets a `beside` slot.** `pageShell.beside` is a snippet the world shell draws right of the time bar, in the same fixed row (left 24, top 24, gap 8). The time bar keeps its size and place. Only a page that sets the slot changes.
2. **The Hangar's header is one row there.** It holds a HANGAR label, the name field, a divider, and AIRCRAFT with its switch, at 44 px high on the bar's glass. The save state stays next to the name as a small dot with a tooltip.
3. **LAUNCH is a white button above Vessel.** It spans the right column, says LAUNCH, and keeps the menu bar's test id. When the checks warn, it shows a caution dot and the warnings as its tooltip. When launch is blocked, it is disabled and its tooltip gives the reason. Shift-click still skips the warnings. The menu bar keeps New, Open and Save.
4. **The Launch page is a hero layout.**
   - **Left:** the vessel library.
   - **Centre:** the hero, with the chosen vessel's picture over a pad backdrop, its name and source, and stats (mass, cost, parts, delta-v, seats).
   - **Right:** the facility cards, the crew, the checks, and the big LAUNCH.
   - **Facility cards:** each card draws its pad or runway as line art. It says Free, or Occupied with the vessel's name and the Recover and Terminate buttons from plan 318 (the same commands the Mission Center sends).
   - **Crew seats:** they are `CrewPortrait`s. A crew member goes to a seat by a click on their row, or by dragging the row onto a seat.
5. **A picture for every design.** A record's saved 3D thumbnail is used when it has one. Otherwise `design-profile.ts` draws a flat side outline from the resolved layout and the parts' shapes (cylinder or box), as SVG. It is pure, cheap, and needs no WebGL on the Launch page.
6. **The library merges copies and groups variants.**
   - Two records are the same design when their designs serialise the same apart from the name. Only the newest record is shown, with a "×n copies" note, and deleting it offers to delete the copies too.
   - Different designs that share a name are variants. They are shown together, newest first, each marked "v2", "v3" and so on with its date.
   - The Hangar's working design is a group of its own ("In the Hangar") above the Library.
   - Search matches the name. The filter is All, Rockets, Aircraft or Crewed. Sorting is by recent edit, name, mass or cost.
   - Each row can be renamed, duplicated, deleted (with a confirmation) or opened in the Hangar. These are the `library.ts` functions the Hangar's dialog uses.

## Consequences

- No data migration: the dedupe is done when the list is shown, so the old records stay as they are.
- The outline picture is simpler than the 3D thumbnail. A design saved from the Hangar after this change has its thumbnail as before.
