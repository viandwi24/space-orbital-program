# 377 — Space Center tour

**Plan:** [plans/377-space-center-tour.md](../plans/377-space-center-tour.md) · **Session:** lessons session (Claude) · **Date:** 2026-10-23 · **ADR:** 0314

## What was done

- Core and sim (API 0.1.110): `place-building.tour`; the placed building keeps what was paid for it (`refund`), upgrades add to it, `remove-building` gives it back (`economy.refund`). Nothing with the economy off.
- `onboarding/sc-tour.ts`: 13 steps (camera, Build, pick the Tracking dish, place, wait for it, Buildings, select, go inside, come back, upgrade, demolish, branches, finish), each with its words (Career and Sandbox differ), the test id to highlight from what is open, and its completion; `advanceTour`, `nextTour`, `backTour` (review: waits for Next), `skipTour`, `tourBuildingOf`, `placesTourBuilding`.
- `sc-tour-store.svelte.ts`: per-world progress in `localStorage` (`orbital.sc-tour.<world>`), "Don't ask again" (`orbital.sc-tour.never`), and the Space Center feed written by the page (placing, selection, buildings, economy, camera drags and wheel over the canvas) and the overlay (Build, tool, Buildings strip, confirm).
- `SpaceCenterTour.svelte` in the world layout: the guide card (Back, Skip tour, Next, Done, Build your first rocket → `/lessons?lesson=hangar`), the highlight ring, bottom left beside the Hangar's parts column and above the Build and Buildings strips.
- `TourOffer.svelte` on a world's first Space Center visit (not in a lesson world); "Space Center tour" in the world menu (≡) restarts it. The Hangar's Start-a-vessel modal waits while the tour runs.

## What surprised me

- The Space Center's canvas lives in the world layout since plan 340, so the page's own element never hears a drag: the camera step listens on the window for events whose target is a canvas.
- Time warp on the Space Center is the time bar's segments; the warp keys are Flight's.

## Verification output

```
bun test packages/sim/test/building-levels.test.ts packages/sim/test/buildings.test.ts packages/core: 403 pass, 0 fail
web vitest onboarding space-center hud layout vab: 312 passed
svelte-check: 0 errors
Career walk: funds at start 100,000; after placing 80,000; after upgrade 20,000; after demolish 100,000
```

## Open questions

- The camera step counts a drag and a wheel over the view; it has no Next. If the Space Center camera ever gets keyboard controls, they should count too.
