# 386 — Off-world bases: the player's flow (first slice)

**Plan:** [plans/386-off-world-bases-player-flow.md](../plans/386-off-world-bases-player-flow.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0352](../decisions/0352-refuel-from-site-storage.md)

## What was done: refuelling from site storage

| Where | What |
|---|---|
| `core/protocol.ts`, `protocol-schemas.ts` | the `refuel { vessel, site }` command |
| `core/events.ts`, `events-catalogue.ts` | `site:refuelled { site, vessel, moved }` |
| `sim/bases.ts`, `commands.ts` | `refuelFromSite`: a landed member takes every stored commodity that names a resource into the tanks that have room, free of charge; refusals for a non-member, an empty site, full tanks |
| `sim/test/bases.test.ts` | a lander with empty tanks joins a base, buys propellant into the base storage, refuels (400 u fuel, 490 u oxidizer, the rest stays), is refused when full, and lifts off on what it took |

## The rest of the flow (Worker B, 2026-10-24, ADR 0360, API 0.1.130)

| Where | What |
|---|---|
| `sim/bases.ts`, `snapshot.ts`, `core/protocol.ts` | `VesselSnapshot.baseOffer`: found (a kit, another body, the site rules' refusal), join (inside a flat zone), refuel (a member with propellant in storage) |
| `web/hud/base-model.ts`, `BaseCard.svelte`, `flight-loop.ts`, the Flight page | the buttons, a name dialog, the commands, the refusals under the card |
| `web/space-center/route-form.ts`, `SpaceCenterOverlay.svelte`, the Space Center page | the new-route form and Delete in the Flows panel |
| `renderer/scene.ts`, `site-list.ts`; `web/space-center/site-views.ts`, `flight-loop.ts` | a base's buildings on its body: the body's radius plus the flat zone's height, carried with the body, hidden while its moon pass sleeps |
| `mods/stock` | `stock.base-kit` and `stock.drill` back in the catalogue and in Surface operations; the off-world kinds shown again in the build menu |
| tests | `sim/test/bases.test.ts` (the three offers appear and go as the vessel joins and the site stocks), `web/hud/base-model.test.ts`, `web/space-center/route-form.test.ts`, `site-views.test.ts` (off-world draws), `renderer/test/site-others.test.ts` (a base stands on the Moon at its height and turns with it) |

## Not done

- ~~The lesson "A base on the Moon"~~ — done later (Worker C): `moon-base` in stock's advanced lessons (a kit lander placed landed on the Moon by `setLocation`; steps: read the base card, found the base, see it in the Space Center), with two new observation fields, `bases` and `baseOffers`; `lesson-flights.test.ts` flies it.
- The Space Center's own 3D view of an off-world site; a cost line on "Found a base here"; the window days in the route form.
- Screens of the card and the form (not taken).
