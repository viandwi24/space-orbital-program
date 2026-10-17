---
id: 091
title: "Space Center in 3D with free grid placement"
status: draft
owner: ""
depends: [090, 086, 087]
phase: 5
created: 2026-10-17
updated: 2026-10-17
---

# 091 — Space Center in 3D with free grid placement

## Goal

A Space Center screen renders the world's first site in 3D from its building list (generators per kind, instancing, distance simplification) with the refs overlay (clickable labels with status, hover detail panel, Needs attention list, building dock, world capsule), a build mode that places, moves, rotates and removes buildings on the grid with live rule feedback, and navigation to Hangar, Launch and Mission Center from their buildings.

## Context

- ADRs: 0097, 0107
- Read: ADR 0097 point 3, ADR 0107, 0030, 0073, 0076, `refs/space-orbital-program-ui/docs/SCREENS.md` (Space Center), `packages/renderer/src/site.ts`, `site-meshes.ts`, `site-animation.ts`.

## Scope

**In:**
- Renderer: site meshes generated from the building list; rebuild on change; an orbit camera over the site; ground and sky from the existing passes at the site's location.
- Route `/space-center`, the overlay and the dock; a building list with keyboard access as an alternative to the camera.
- Build mode: ghost building with valid/invalid colour, reasons from `canPlace`, rotate, road drawing, remove.
- Entering a world goes to the Space Center; the world capsule's home button returns here.

**Out:** costs, levels and construction time (096), site choice (092).

## Touches

- **Size:** L
- **Edits:** `packages/renderer/src/site.ts`, `packages/renderer/src/site-meshes.ts`, `packages/renderer/src`, `apps/web/src/routes/space-center`, `apps/web/src/lib/ui`
- **Shared contracts:** none (consumes 090's contract); renderer API addition `Renderer.setSite`

## Design notes

Performance budget set here: at the default camera with the stock layout, `high` and `medium` frame times measured (M5) and draw calls counted; buildings instanced by kind.

## Steps

1. Renderer: generator kinds for each stock building.
2. Space Center route with overlay.
3. Build mode.
4. Navigation wiring.
5. Performance and screenshots.

## Acceptance criteria

- [ ] vitest: the overlay lists every building of the snapshot's site with its status; keyboard navigation reaches each and opens its detail.
- [ ] vitest: build mode shows the `canPlace` reasons for an invalid ghost; confirming a valid one dispatches `place-building`.
- [ ] Journal: frame times at the default camera (`high`, `medium`, M5) and draw calls; screenshots in `docs/journal/assets/091-*.png` with the self-review against the refs Space Center and ADR 0025.
- [ ] `bun run e2e` (Chromium): enter a world, place a building, open the Hangar from its label.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/091-space-center-3d-and-grid-placement.md` written.
- [ ] `architecture/overview.md` (Space Center view), `product/visual-direction.md` (Space Center).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097, 0107).
- 2026-10-17 — `depends` gains 087 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): entering a world goes to the Space Center and the e2e criterion enters a world from the Worlds screen of plan 087.
