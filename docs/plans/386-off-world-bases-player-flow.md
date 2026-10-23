---
id: 386
title: "Off-world bases from the player's side: deploy a base kit, join a site, routes, refuelling"
status: draft
owner: ""
depends: [128, 384]
phase: 7
created: 2026-10-23
updated: 2026-10-23
---

# 386 — Off-world bases: the player's flow

## Goal

The player-journey audit's J7, option (a), approved by the owner on 2026-10-23 as a plan for later. Option (b) is done: the kit, the drill and the off-world buildings are hidden.

Plan 128 built bases, outposts and cargo routes in the sim (`deploy-base`, `join-site`, `create-route`), but no screen sends those commands, and a base's stored propellant has no use. This plan gives each a flow, then shows the parts again.

## Context

- Plan 128 and ADR 0125 (bases, outposts, routes); ADR 0321 (one site mesh per site).
- `packages/sim/src/bases.ts`; `mods/stock/src/bases.ts` (kit, drill, hub, ISRU plant, storage module); `apps/web/src/lib/space-center/model.ts` (the Flows panel).
- The audit: `docs/research/player-journey-audit.md` J7; `docs/research/system-audit-2026-10.md` (the buildings audit).

## Scope

**In:**
- **Deploy a base.** On a landed, still vessel carrying a base kit, the vessel menu and the Flight HUD offer "Found a base here…": a name, the spot's facts (body, latitude and longitude, flat ground), and the cost. It sends `deploy-base`; the new site shows in the Space Center's site list.
- **Join a site.** A landed vessel inside a site's flat radius offers "Join <site>", and its drills then fill the site's storage. Moving off leaves the site, as the sim already does. The Flows panel lists members.
- **Routes.** In the Space Center's Flows panel: "New route", from a site to a site, with a commodity and an amount per window, showing the window, the cost and the launch-service fee. Routes can be deleted.
- **Refuelling.** A landed vessel at a site (a member) gets "Refuel from site storage", which moves the traded propellants it can hold. ISRU output then has a use: a lander refuels on the Moon and flies home.
- **A base in 3D.** The renderer draws an off-world site's buildings at its place on its body (ADR 0321's `SiteBuildings`, on a moon pass).
- **The parts again.** The kit and drill return to the catalogue and to "Surface operations"; the off-world buildings return to the build menu at an off-world site.
- **A lesson,** "A base on the Moon", in the lessons-advanced set.

**Out:**
- Launching from an off-world site (a pad on the Moon). That would be its own plan.

## Acceptance criteria

- [ ] A headless flight lands a kit on the Moon, deploys a base, builds an ISRU plant, and a lander refuels from it and reaches Moon orbit.
- [ ] The web model tests cover deploy, join, the route form and refuel (offer, refusal and reason).
- [ ] The kit and drill are back in the tree and the catalogue; the stock tech tests list no hidden part but the debris and the suit.
- [ ] `bun run typecheck`, the sim, web and renderer tests pass.

## Docs checklist

- [ ] `docs/STATUS.md`
- [ ] An ADR if the flow changes plan 128's decisions
- [ ] `docs/guides/writing-a-mod.md` (bases section)
- [ ] Journal `386-off-world-bases-player-flow.md`

## Log

- 2026-10-23: Written as a draft for the player-journey audit's Q5 (a).
