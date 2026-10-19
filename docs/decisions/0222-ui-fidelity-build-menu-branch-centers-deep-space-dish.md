# 0222 — UI v2 fidelity, a categorised build menu, branch space centers and a deep-space dish

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/233-base-layout-fidelity-to-refs-v2.md, plans/234-deep-space-dish.md, plans/235-space-center-build-menu.md, plans/236-branch-space-centers.md
**Amends:** ADR 0201 (the Base layout must match `refs/space-orbital-program-ui-v2/` exactly); ADR 0097 and 0115 (building placement)

## Context

The owner tested the release work by hand on 2026-10-19 and reported four problems.

1. The world shell from plan 204 does not match the v2 design package (`refs/space-orbital-program-ui-v2/`): there is a top navigation bar nobody asked for, the status bar looks improvised, and the bell icon is wrong. The cause is in our process, not in the design: the package was never committed, so the worker sessions in their own worktrees never saw it and built from a text summary.
2. The Space Center build menu is plain. The owner wants a city-builder menu (Cities: Skylines style): categories along the bottom (for example Comms), cards with a picture of each building, and its cost and size.
3. The tracking dish (`stock.tracking-dish`, `mods/stock/src/buildings.ts:130`) is a small 2 × 2 generic model. The owner wants a large, realistic parabolic antenna "like in the films".
4. Space centers should be buildable anywhere on the home planet as **branches**, like real agencies with several launch and tracking sites, linked into one network.

## Decision

1. **The design package is the reference.** `refs/space-orbital-program-ui-v2/` is committed (it is public with the repository; the owner agreed).
   - Every in-world screen matches `docs/BASE_LAYOUT.md` and `tokens/tokens.css` as written: the time bar, the menu bar (page actions | Vessel · Map · Space Center · VAB | Menu), and the 32 px status bar with its zones, the 26 × 26 bell and the icon paths of §6.
   - There is no other top bar.
   - Each fidelity plan proves the match with side-by-side screenshots against the `.dc.html` sources at 1920 × 1080.
2. **Build menu:**
   - A category bar along the bottom of the Space Center: Launch, Comms, Science, Crew, Administration, Production, Infrastructure, plus mod categories.
   - Each category opens a row of cards. A card shows a rendered thumbnail of the building, its name, cost, size, build time, level range and the requirements it still lacks.
   - Hovering a card shows its details; choosing it starts the existing placement preview.
   - Thumbnails come from the building generators (rendered once and cached), so mod buildings get them too.
3. **Deep-space dish:** a new stock building, `stock.deep-space-dish`, modelled on real deep-space network antennas (a 34–70 m class):
   - concrete pedestal;
   - alidade with elevation wheel;
   - parabolic reflector with panel rings and back structure;
   - quadripod;
   - subreflector and feed cone.

   The dish slowly tracks the active vessel or the sky. It is a high-tier comms node: long range and high data rate, expensive. The small `stock.tracking-dish` stays as the early tier.
4. **Branch space centers on the home planet:**
   - The player picks a spot on the home globe in a site picker. Flat zones are preferred (ADR 0115 rules), and coastline, latitude and terrain are shown.
   - The player pays a founding cost and waits for the HQ to be built on the world tick (ADR 0123).
   - Each branch has its own buildings: a launch pad or runway, dishes and so on.
   - Branches with a comms building are ground stations in the network (ADR 0101 tiers), so the network grows by geography.
   - The status bar location names the current site, and the Space Center switches between sites.
   - Launch picks a pad at any site.
   - Off-world sites (plan 128) keep their own rules.
5. **Order (owner's rule):** a worker that built a screen now found off-design fixes that screen as soon as its current plan is merged, before it starts another plan. Plan 233 comes first, from the worker who built plan 204.

## Alternatives considered

- **Keep the shell and restyle it piecemeal:** rejected, because the owner asked for the reference design, not an approximation.
- **Only a bigger tracking dish:** rejected, because the owner asked for a realistic, recognisable deep-space antenna as its own building.
- **Branches as off-world-style outposts:** rejected, because a branch is a full space center with its own pads, buildings and network role.

## Consequences

- New plans 233–236 join the release roadmap. Plan 233 has priority over any unclaimed plan.
- Plan 236 needs per-site state in the world (sites already exist since plan 092). It touches the launch screen (094) and Mission Center ground stations (114–121).
- Plan 232 (release QA) also depends on 233–236.
