# 0314 — The Space Center tour, and the tour building's refund

**Status:** accepted (owner's request, 2026-10-23)
**Date:** 2026-10-23
**Plan:** plans/377-space-center-tour.md
**Amends:** ADR 0123 point 1 (construction cost), ADR 0293 (the guide card)

## Context

New players open a world on the Space Center and find a 3D site, a Build strip, a Buildings strip and panels with no word on what to do. The owner asked for an opt-in tour at the start of a new world that has the player do the real things: move the camera, build an antenna, visit a building, upgrade, demolish. In Career, building and upgrading cost funds and demolishing gives nothing back, so a tour that has the player build and demolish would cost them a tracking dish and an upgrade.

## Decision

1. **Offer.** The first Space Center visit of a world (not a lesson world) shows a welcome modal: Start the tour, Skip, and Don't ask again (every world, this browser). The choice is kept per world; the world menu's "Space Center tour" restarts it.
2. **Stepper.** The tour is a step machine like the lessons' (ADR 0293): each step completes only on its own observation, one per observation; information steps complete on Next. Back shows the previous step for review: it does not complete on its own again until Next. Skip ends the tour. The card is the guide card (`GuideFrame`, bottom left, minimise pill) and the step's target gets the highlight ring.
3. **Observation.** The Space Center page and its overlay publish a feed (overlay mode, Build open and its tool, the building being placed, whether the ghost was invalid, the selection, the Buildings strip, the branch picker, the site's buildings, camera drags and zooms); the world layout adds the page and the warp. The tour runs in the world layout, so a visit to the Hangar or the Mission Center counts.
4. **Free in Career.** `place-building` takes an optional `tour: true`. The sim then keeps on the placed building what was paid for it (`refund`, funds), adds each upgrade's cost to it, and gives it back when the building is removed (cause `economy.refund`). With the economy off nothing is paid and nothing is given back. A refund needs the building gone, so the flag cannot make money.

## Consequences

- API 0.1.110: `place-building.tour`, `PlacedBuilding.refund`, `ECONOMY_CAUSES.refund`. Additions only; old saves load unchanged.
- The tour building is the tracking dish, cheap and quick (20,000 funds, 2 days); the tour asks the player to warp through its construction.
