# 0243 — Space Center: pins instead of permanent labels, a building panel with an upgrade block, one compact list

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/259-space-center-building-ui.md
**Builds on:** ADR 0117 (the site view), ADR 0123 (building levels, upkeep and upgrades), ADR 0222 (the city-builder build menu); research in `refs/space-center-ui-research.md`

## Context

The owner's manual test (items 20–22): the building names sit over the scene like buttons and do not blend with it, opening a building shows a plain panel, and the right panel looks bad. The research (`refs/space-center-ui-research.md`) found the same patterns in the building games it could reach: quiet markers with names on hover or selection, a tag tied to its object, camera framing on selection, a panel in a fixed order, and one list rather than several.

## Decision

1. **Pins.** Each building has a pin: a dot and a stem at its anchor. The name tag (name and status) shows on pointer hover, keyboard focus and selection, or on every pin when the "Names" switch is on "always". The switch is remembered in `localStorage` under `orbital.space-center.labels`, with the browser's storage treated as optional. A building that is not running has a warning-coloured dot. A pin is still a button with the building's name and status as its accessible name (`sc-label-<kind>`).
2. **The building panel,** in this order: header with the close button; level pips and "Level n of m"; status; description; the numbers the level provides and its upkeep per 30 days; the upgrade block (next level, cost, days, the Upgrade button); then the main action, Frame, and Remove (build mode). The rows carry `level`, `maxLevel`, `description`, `upkeep` and `capacity` from the building definition.
3. **Camera.** `Renderer.setSiteFocus(point | null, { distance?, animate? })` moves the site view's orbit pivot to a point of the site and eases there (about a quarter second); it never zooms out, and brings the camera in to 160 m when it is further. Selecting a building frames it, closing or switching site returns to the centre, and the Frame button repeats it after the player has orbited away. With `prefers-reduced-motion` the camera jumps.
4. **One list.** The right column is: the site picker and the Names switch; the building panel; one Buildings list that scrolls, with the "Needs attention" lines under it (`sc-attention` stays) and a count in the header. Hovering a row shows that building's name in the scene.

## Alternatives considered

- **Names always on, restyled** — rejected: five or more buildings overlap, and the owner asked for hover.
- **An outline shader on the selected building** — left for a renderer task of its own; the stem, the tag and the framing carry the selection.
- **Folding the list into the building panel** — rejected: the list is the keyboard route to every building (ADR 0117), so it stays.

## Consequences

- E2E tests use `sc-label-*`, `sc-detail`, `sc-open`, `sc-upgrade`, `sc-attention` and `sc-list`: all kept. Clicking a pin when the tag is hidden still works (the pin is the button).
- API unchanged (the renderer method is additive).
