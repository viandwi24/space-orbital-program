---
id: 128
title: "Off-world bases: base kits and parts left on the surface"
status: in-progress
owner: "Agent 1"
depends: [096, 092, 082]
phase: 9
created: 2026-10-17
updated: 2026-10-18
---

# 128 — Off-world bases: base kits and parts left on the surface

## Goal

A base can be founded on another body in two ways: a base kit lands and deploys, opening a site with plots and a catalogue filtered by the body; or a landed vessel is made a member of a site (an outpost), keeps working on the world tick, and can drive away again. One commodity chain (for example ice to water to propellant) and one supply route are the first slice.

## Context

- ADRs: 0097, 0098, [0125](../decisions/0125-off-world-bases-kits-outposts-isru-supply-routes.md) (written at claim: craters zones, the kit, placement rules, outposts, the ISRU step, routes, the Flows panel)
- Read: ADR 0097 point 7, ADR 0098 (commodities), `refs/reverse-engineering-ksp2/11-colonies-resources-interstellar.md` and `beyond/08-space-center-building-and-colonies.md` §5 (git-ignored).

## Scope

**In:**
- Base kit part and deploy action; site creation on another body with a flat zone (terrain kinds `craters` and `hills`).
- Building catalogue filtered by body rules.
- Outposts: membership command for landed vessels; background operation of their modules.
- One ISRU recipe and site storage; one abstract supply route repeating a proven flight on transfer windows.
- Sankey-style flow panel in the Space Center for the base.

**Out:** colonies with population, interstellar.

## Touches

- **Size:** L
- **Edits:** `packages/core`, `packages/sim`, `mods/stock`, `packages/renderer/src`, `apps/web/src/routes/space-center`
- **Shared contracts:** **save (sites on other bodies, members), SDK (body building rules)**

## Design notes

Off-world sites reuse the Space Center screen: a site picker, the Flows panel and the build dock for the chosen site; the 3D view stays the primary site's (ADR 0125 point 7: drawing a base on another body's ground is a renderer plan of its own).

## Steps

1. Base kit and site creation.
2. Outpost membership.
3. ISRU chain and storage.
4. Supply route.
5. UI.

## Acceptance criteria

- [x] `packages/sim` test: a deployed base kit on the moon creates a site whose flat zone appears in the moon's height function.
- [x] `packages/sim` test: a landed vessel made an outpost runs its drill on the world tick and stops when it drives off.
- [x] `packages/sim` test: the supply route delivers its cargo on each window and books its cost.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/128-off-world-bases.md` written.

- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097, 0098).
- 2026-10-18 — Claimed by Agent 1 (all depends merged) and refined with ADR 0125 (the draft said what, not how): craters zones toward the centre's own height (sim and the moon pass's bakes), `deploy-base` from a landed `stock.base-kit` on another body (a `base` site with the hub), `placement: 'home' | 'off-world'` on buildings, `join-site` outposts that leave when they lift off or drive away, `stock.drill` 50 u of ice a day, recipes that consume their inputs (`stock.ice-electrolysis` in the ISRU plant), `create-route` / `delete-route` on the synodic window with the launch-service price, the site picker and the Flows panel. The base kit and the drill sit in tier 5 (`stock.surface-operations`). API_VERSION 0.1.64.
- 2026-10-18 — Criteria: sim `bases.test.ts` (5: the zone in the moon's height function after the next load, home and off-world placement, an outpost's drill and its lift-off, the ISRU step, a route's two windows and its cost), core `craters-zones.test.ts`, renderer `craters-zones.test.ts`, vitest `space-center/model.test.ts` (+2); full checks in the journal.
- 2026-10-18 — Merged by Agent 1 (own lane): rebased after 065 and 099 (no conflicts); API_VERSION 0.1.64; bun test 1679 pass, web vitest 1026 pass, typecheck, build, docs:check, smoke e2e 7 passed (the moon pass's craters shaders with the zone uniforms compile in flight); launch, mission-center, space-center and worlds e2e pass (Chromium).
