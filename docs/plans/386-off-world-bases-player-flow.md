---
id: 386
title: "Off-world bases from the player's side: deploy a base kit, join a site, routes, refuelling"
status: done
owner: "Worker B"
depends: [128, 384]
phase: 7
created: 2026-10-23
updated: 2026-10-24
---

# 386 — Off-world bases: the player's flow

## Goal

The player-journey audit's J7, option (a), approved by the owner on 2026-10-23 as a plan for later. Option (b) is done (1bf9915f): the kit, the drill and the off-world buildings are hidden from the catalogue, the tree and the build menu.

Plan 128 built bases, outposts and cargo routes in the sim, but no web screen sends `deploy-base`, `join-site` or `create-route`, and a base's stored propellant has no use. When this is done, each has a flow, a landed vessel can refuel from site storage, an off-world base is drawn on its body, and the parts are shown again.

## Context

- Plan 128 and ADR 0125 (bases, outposts, ISRU, routes); ADR 0321 (one site mesh per site, plan 384).
- Commands: `packages/core/src/protocol.ts` ~1074–1084 (`deploy-base`, `join-site`, `create-route`, `delete-route`). No refuel command exists in the sim.
- `packages/sim/src/bases.ts`; `mods/stock/src/bases.ts` (kit, drill, hub, ISRU plant, storage module; `catalog: { hidden: true }` ~45, ~64).
- `apps/web/src/lib/space-center/model.ts`: the Flows panel already lists a site's members and their drills (~450–456) and the routes touching it.
- Renderer: `Environment.otherSite` (`packages/renderer/src/environment.ts` ~239) builds `SiteBuildings` for home-planet sites only, at the home radius and under the home planet's root.
- The audit: `docs/research/player-journey-audit.md` J7; `docs/research/system-audit-2026-10.md` (the buildings audit).

## Scope

**In:**
- **Deploy a base.** On a landed, still vessel carrying a base kit, the vessel menu and the Flight HUD offer "Found a base here…": a name, the spot's facts (body, latitude and longitude, flat ground), and the cost. It sends `deploy-base`; the new site shows in the Space Center's site list.
- **Join a site.** A landed vessel inside a site's flat radius offers "Join <site>", and its drills then fill the site's storage. Moving off leaves the site, as the sim already does.
- **Routes.** In the Flows panel: "New route", from a site to a site, with a commodity and an amount per window, showing the window, the cost and the launch-service fee. Routes can be deleted.
- **Refuelling.** A new sim command and protocol message: a landed member vessel moves the traded propellants it can hold from site storage. ISRU output then has a use: a lander refuels on the Moon and flies home.
- **A base in 3D.** An off-world site's buildings drawn at its place on its body: `otherSite` taken off the home planet (the body's radius and frame, the moon pass's lighting).
- **The parts again.** The kit and drill return to the catalogue and to "Surface operations"; the off-world buildings return to the build menu at an off-world site.
- **A lesson,** "A base on the Moon", in the lessons-advanced set.

**Out:**
- Launching from an off-world site (a pad on the Moon); its own plan.
- The Flows panel's member list (already shipped).

## Steps

1. ADR for refuelling from site storage (changes plan 128's decisions): the command, who may refuel, which resources, the ledger.
2. Sim and protocol: the refuel command; headless test.
3. Web: deploy, join and refuel offers (model and UI), with refusals and reasons.
4. Web: the route form in the Flows panel.
5. Renderer: off-world `SiteBuildings` on their body.
6. Stock: unhide the kit, drill and off-world buildings; the lesson.

## Acceptance criteria

- [ ] `bun test packages/sim` passes a headless flight that lands a kit on the Moon, deploys a base, builds an ISRU plant, and a lander refuels from it and reaches Moon orbit.
- [ ] `cd apps/web && bunx vitest run` passes model tests for deploy, join, the route form and refuel (offer, refusal and reason).
- [ ] `bun test packages/renderer` passes a test placing an off-world site's buildings on the Moon.
- [ ] `bun test mods/stock` passes: the kit and drill are in the tree and the catalogue; no hidden part but the debris and the suit.
- [ ] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md`
- [ ] ADR for the refuel command (changes plan 128's decisions)
- [ ] `docs/guides/writing-a-mod.md` (bases section)
- [ ] Journal `386-off-world-bases-player-flow.md`

## Log

- 2026-10-23: Written as a draft for the player-journey audit's Q5 (a).
- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: partly done; the Flows panel already lists members (dropped); no web UI sends the base commands; refuel needs a new sim and protocol command with an ADR; off-world site meshes need `otherSite` taken off the home planet; parts still hidden.
- 2026-10-24 — Worker C, first slice (plan stays `draft`): steps 1 and 2 done: ADR 0352 and the `refuel` command with a headless test (`packages/sim/test/bases.test.ts`). Steps 3 to 6 (web offers and route form, off-world site meshes, unhiding the parts, the lesson) are open; see the journal.
- 2026-10-24 — Worker B, steps 3 to 6 (ADR 0360, API 0.1.130): the Flight HUD offers (found, join, refuel) from `VesselSnapshot.baseOffer`, the route form in the Flows panel, a base drawn on its body, the kit and drill back in the catalogue and the tree. Open: the lesson "A base on the Moon", the Space Center's 3D view of an off-world site.
- 2026-10-24 — The lesson "A base on the Moon" added (Worker C) through the lessons registry (ADR 0355): stock's advanced set, a baked kit-lander vessel, `LessonObservation.bases` and `.baseOffers`; `lesson-flights.test.ts` founds the base from the kit lander on the Moon and reads the steps. The plan stays `done`.

