# 0352 — A member vessel refuels from its site's storage

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/386-off-world-bases-player-flow.md
**Builds on:** ADR 0125 (off-world bases, outposts, ISRU, routes), ADR 0124 (site storage and the market)

## Decision

1. **A `refuel` command** `{ vessel, site }`. It changes ADR 0125, which gave a base's stored propellant no use.
2. **Who.** A vessel that is a member of the site (it joined with `join-site`, so it is landed, at rest and within the flat zone) and still landed at rest. A non-member is refused with "join the site first"; the site's own flat radius is the range.
3. **What.** Every stored commodity that names a `resource` (liquid fuel, oxidizer, and any a mod defines the same way) goes into the vessel's tanks that hold the resource, up to their room, in resource units equal to commodity units. What does not fit stays in storage.
4. **Cost.** None: the propellant was paid for when it was bought, delivered by a route or made by the ISRU plant. The ledger does not move.
5. **Refusals.** "the site stores no propellant yet"; "the vessel has no room for the propellant in storage".
6. **Event.** `site:refuelled { site, vessel, moved }` (`moved` maps resource to units).
7. **Not in this ADR.** A reverse move (vessel to storage), partial refuelling by amount, and the flow rate. The command is a single instant top-up; a rate comes if a player flow needs it.

## Consequences

- ISRU output has a use: a lander can refuel on the Moon and fly home.
- The protocol gains `refuel` (core `protocol.ts` and `protocol-schemas.ts`); no API version change for mods (not part of the plugin API).
