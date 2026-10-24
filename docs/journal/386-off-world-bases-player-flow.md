# 386 — Off-world bases: the player's flow (first slice)

**Plan:** [plans/386-off-world-bases-player-flow.md](../plans/386-off-world-bases-player-flow.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0352](../decisions/0352-refuel-from-site-storage.md)

## What was done: refuelling from site storage

| Where | What |
|---|---|
| `core/protocol.ts`, `protocol-schemas.ts` | the `refuel { vessel, site }` command |
| `core/events.ts`, `events-catalogue.ts` | `site:refuelled { site, vessel, moved }` |
| `sim/bases.ts`, `commands.ts` | `refuelFromSite`: a landed member takes every stored commodity that names a resource into the tanks that have room, free of charge; refusals for a non-member, an empty site, full tanks |
| `sim/test/bases.test.ts` | a lander with empty tanks joins a base, buys propellant into the base storage, refuels (400 u fuel, 490 u oxidizer, the rest stays), is refused when full, and lifts off on what it took |

## Not done (the plan stays `draft`)

- Web models and screens: "Found a base here…", "Join <site>", the route form in the Flows panel, a "Refuel" offer (the command and its refusal reasons are ready for them).
- Renderer: `Environment.otherSite` for an off-world site's buildings on their body.
- Stock: unhiding the kit, drill and off-world buildings; the lesson "A base on the Moon". The kit stays hidden until a screen can deploy it.
