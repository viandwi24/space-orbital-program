---
id: 094
title: "Launch screen: site, pad or runway, design, crew"
status: in-progress
owner: "Agent 2"
depends: [091, 093]
phase: 5
created: 2026-10-17
updated: 2026-10-18
---

# 094 — Launch screen: site, pad or runway, design, crew

## Goal

Between the Hangar and the flight, a Launch screen lets the player pick the launch facility of the current site (pad sizes, runway), a design from the library filtered by what that facility accepts (with "Edit in Hangar"), crew seats (empty until the crew core), sees cost, mass and crew, and launches ("Launch from pad" / "Roll out to runway").

## Context

- ADRs: 0097, 0107
- Read: ADR 0097, 0107, `refs/space-orbital-program-ui/docs/SCREENS.md` (Launch), `apps/web/src/lib/vab` (library), `flight-loop.ts` (`load-vessel`).

## Scope

**In:**
- Route `/launch`, facility list from the site's buildings that `provide` launch-pad or runway, preview.
- Library filter by facility limits (pad size, mass when 096 lands).
- Seat slots (disabled with a note until 106).
- Launch dispatches `load-vessel` with `{ site, pad }` (084).

**Out:** crew assignment logic (106), range safety (127).

## Touches

- **Size:** S
- **Edits:** `apps/web/src/routes/launch`, `apps/web/src/lib/vab`, `apps/web/src/lib/flight-loop.ts`
- **Shared contracts:** none

## Design notes

The VAB launch button goes to this screen; a "quick launch" key keeps today's direct path for testing.

## Steps

1. Route and facility list.
2. Filtered library.
3. Launch wiring.
4. e2e.

## Acceptance criteria

- [x] vitest: a site with a small pad lists only designs under the pad's size limit; the runway lists designs flagged as aircraft (or all designs when no flag exists yet).
- [x] vitest: a facility's spot is the centre of its footprint as latitude and longitude; the Legacy pad is at the site origin.
- [x] `bun run e2e` (Chromium): Hangar to Launch to flight; the vessel stands on the chosen pad (landed, no vessel lost).
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/094-launch-screen.md` written.

- [x] ADR 0150.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097, 0107).
- 2026-10-18 — Claimed by Agent 2 (Dev B, M2).
- 2026-10-18 — Refined with ADR 0150: facilities are the site's pad and runway buildings, placed by surface position (no protocol change); seats wait for 108.
- 2026-10-18 — Done on the branch: `/launch` with facilities from the site's buildings, accepted designs, seats note, summary; placement by surface position; Shift+Launch for the direct path. Journal: [094](../journal/094-launch-screen.md).
- 2026-10-18 — Merged by Agent 1: rebased on main (conflicts in the ADR index and the flight page imports, both sides kept); bun test 1575 pass, web vitest pass, typecheck, build, docs:check, smoke e2e 7 passed; launch and worlds e2e pass in Chromium, Firefox and WebKit.
