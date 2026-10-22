---
id: 346
title: "Hangar header beside the time bar, a white LAUNCH above Vessel, the Launch page redesign, and a vessel library to manage"
status: done
owner: "ui-v3 session (Claude, 2026-10-22)"
depends: [272, 285, 318, 341]
phase: 7
created: 2026-10-22
updated: 2026-10-22
---

# 346 — Hangar header, LAUNCH button, Launch page, vessel library

## Goal

The owner's feedback of 2026-10-22 (screenshots `refs/owner-shots/hangar-2026-10-22.jpg` and `launch-2026-10-22.jpg`):

1. In the Hangar, the vessel name and the AIRCRAFT switch become one compact row in the top bar, right of the time-warp control.
2. Launch leaves the top-right icon bar. A full-width white **LAUNCH** button sits above the right column's Vessel section.
3. The Launch page (`/launch`) is plain. It gets a v3-2 style layout: a hero preview of the chosen vessel with its stats, facility cards with pad art and status, crew seats as portraits, and a big LAUNCH.
4. The vessel list is a long column of duplicates. It becomes a library you can manage: search, a type filter, sorting, thumbnails, groups, identical copies merged, and rename, duplicate, delete and open in the Hangar.

## Context

- ADR 0295 (this plan's decisions)
- ADR 0253 (the v3 shell), ADR 0041 (the vessel library), plan 285 (blueprint library), plan 318 (recover and terminate), plan 341 (crew portraits)
- `refs/space-orbital-program-ui-v3-2` for the card and hero style

## Scope

**In:**
- `pageShell.beside`: a snippet the world shell draws right of the time bar, in one fixed row with it.
- The Hangar's one-row name and aircraft header, set through `pageShell.beside`; the old capsule above the left column goes.
- The LAUNCH button at the top of the Hangar's right column: a caution dot and the warnings as its tooltip; disabled with the reason when launch is blocked. It keeps `data-testid="menu-launch"`.
- `lib/launch/vessel-library.ts`: pure dedupe, variants, search, type filter and sort, with a vitest.
- `lib/launch/design-profile.ts`: a pure side-view outline of a design from its layout and part shapes, for designs without a saved thumbnail, with a vitest.
- The Launch page: a header with the site, a vessel library column, a hero with the picture and stats, facility cards with pad art and a free or occupied status (Recover or Terminate on an occupied one), seats as `CrewPortrait`s that take crew by click or drag, the checks, and a big LAUNCH.
- Library actions on the Launch page: rename, duplicate, delete with confirmation, and open in the Hangar.

**Out:**
- e2e runs (the owner asked to skip them this round). The testids the e2e specs use stay.
- Changes to the Hangar's Open dialog (it keeps working on the same store).

## Steps

1. Plan, ADR, claims.
2. `pageShell.beside` and the Hangar header row.
3. The LAUNCH button; Launch removed from the menu bar.
4. `vessel-library.ts` and `design-profile.ts` with tests.
5. The Launch page redesign and the library actions.
6. Checks, screenshots, journal, STATUS, push, report.

## Acceptance criteria

- [x] The Hangar's name field and AIRCRAFT switch are one 44 px row right of the time bar; the time bar stays at left 24, top 24.
- [x] The menu bar has no Launch; a white LAUNCH button sits above the Vessel stats, shows a caution dot when checks warn, and is disabled with the reason when blocked.
- [x] Identical library designs show once; variants of one name show their mass and date; search, filter (rocket, aircraft, crewed) and sort (recent, name, mass, cost) work — `vessel-library.test.ts`.
- [x] Designs without a thumbnail get an outline picture — `design-profile.test.ts`.
- [x] The Launch page shows the hero, facility cards with status, portrait seats and the big LAUNCH; rename, duplicate, delete (with confirm) and open in the Hangar work.
- [x] `bun run typecheck`, the web vitest (`CI=true`), lint and `bun run docs:check` pass. Before and after screenshots are in the journal.

## Docs checklist

- [x] `docs/STATUS.md`
- [x] ADR 0295 and its index row
- [x] Journal `346-hangar-header-launch-page-vessel-library.md`

## Log

- 2026-10-22: Written from the owner's feedback (relayed by the main session) and done on the same day. See [journal 346](../journal/346-hangar-header-launch-page-vessel-library.md). e2e was not run, at the owner's request.
