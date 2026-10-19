# 0227 — Building categories in the category registry, and the build menu's cards

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/235-space-center-build-menu.md
**Builds on:** ADR 0222 point 2 (a categorised build menu), ADR 0146 (catalogue categories as a registry), ADR 0097 and 0115 (buildings as data, placement), ADR 0123 (costs and build days), ADR 0125 (home and off-world buildings)

## Context

The Space Center's build dock is a row of text buttons, one per building kind. The owner asked for a city-builder menu: categories along the bottom, each opening a row of cards with a picture of the building (ADR 0222 point 2). Buildings have no category, and mods must be able to add their own categories with an icon. Part categories already exist as a registry (ADR 0146), with ids, labels, icons and an order, which mods register through `ctx.categories`.

## Decision

1. **One category registry, with a scope.** `CategoryDefinition` gains an optional `scope: 'parts' | 'buildings'`; absent means parts, so every existing category and mod keeps its meaning. The Hangar's rail lists the parts scope only; the build menu lists the buildings scope. A mod adds a building category the way it adds a part category: `ctx.categories.register({ id, label, icon, order, scope: 'buildings' })`. No new registry, no new registrar.
2. **A building names its category.** `BuildingDefinition.category` is an optional category id. A building without one, or naming an id that is not a registered buildings-scope category, lands in `stock.other-buildings` ("Other"), last.
3. **Stock building categories,** order 100 to 700: Launch (`stock.launch`: pads, runway), Comms (`stock.comms`: the tracking dish), Science (`stock.science`: R&D, the test stand), Crew (`stock.crew`: the Astronaut Complex), Administration (`stock.administration`: the Mission Center, Administration), Production (`stock.production`: the propellant plant, ISRU, the drill, storage), Infrastructure (`stock.infrastructure`: the Hangar, the base hub); Other at 10 000. The ids do not meet the nine part short names.
4. **Cards.** A card shows the thumbnail, the name, the cost of level 1, the size in metres, the build days and the level range. A card that cannot be built here is shown disabled with its reason in words, in this order: home only or off-world only, a body the building does not allow, then funds (economy on) against the level-1 cost. The sim stays the judge (its `place-building` refusal is shown if it differs); the menu only explains early.
5. **Thumbnails are drawn once per session.** The renderer draws a building's generator into an offscreen target at 256 × 160 with a fixed three-quarter camera and light, reads it back as a data URL and caches it by `visual` (generator name or asset path) for the session. A card shows the category icon until its picture is ready. One small `WebGLRenderer` serves the queue, one building at a time, and is disposed when the queue empties.
6. **The menu.** The category bar sits at `bottom: 52` (BASE_LAYOUT §5) in the v2 dock's glass style. One category is open at a time; its cards scroll sideways above the bar. Hovering or focusing a card shows its details (the description of every level). Choosing a card starts the existing placement preview (plan 091); Esc or the open category's button closes the row. Arrow keys move along the bar and the cards; targets are at least 44 px.

## Consequences

- `category` and `scope` are additive: old mods and saves are unchanged; `API_VERSION` takes a patch step.
- A future building only needs `category` to appear in the right row; plan 234's deep-space dish names `stock.comms`.
- Thumbnails cost one offscreen draw per kind the first time the menu opens a category, not per frame.
