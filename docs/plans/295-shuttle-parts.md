---
id: 295
title: "Shuttle parts: orbiter fuselage, delta wing, cargo bay with opening doors, OMS pods, tail, orbiter engines, external tank, shuttle SRBs"
status: dropped
owner: ""
depends: [291, 276, 281]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 295 — Shuttle parts: orbiter fuselage, delta wing, cargo bay with opening doors, OMS pods, tail, orbiter engines, external tank, shuttle SRBs

## Goal

Everything the "Ulang-Alik" (Space Shuttle) mission needs: an orbiter built from fuselage sections (nose with cockpit windows and nose RCS, mid-body with a long cargo bay whose two doors open with radiators inside, aft body with three main-engine mounts), a double-delta wing with elevons and black heat-tile undersides, a vertical tail with rudder and speed brake, two OMS pods, an external tank (5 m class, orange foam livery, ogive nose, SRB and orbiter attach points) and two large segmented SRBs with nose cones. The orbiter glides home.

## Context

- Research: `refs/part-visuals-and-blueprints/parts-tracker.md` (§11, missions and the parts they need).
- ADRs: 0257, 0261, 0256
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** Generators: shuttle fuselage (nose, mid, aft), cargo bay with doors (uses `ModuleBay` of plan 281), delta wing, tail, OMS pod, external tank with `foam` livery, attach struts between orbiter and tank; heat-tile material (`tile` slot, black underside, white top); OrbitX titles.
**Out:** Runway landing gameplay beyond the existing gear and wing lift (draft 063).

## Design notes

The orbiter is several parts, as in KSP (Mk3 fuselage, wings, tail), so the payload bay is a real bay part. Wing lift and control surfaces exist (ADRs 0075, 0045). The heat tiles are a material on the wing and fuselage generators plus a heat tolerance on the parts.

## Steps

1. Fuselage and bay generators and parts.
2. Wing, tail, OMS pods.
3. External tank, attach struts, SRB fit.
4. Headless test: an orbiter alone, released at 30 km and Mach 2, glides to a controlled descent without tumbling.

## Acceptance criteria

- [ ] Cargo bay doors open and close in flight; a payload inside is shielded while closed (sim test, plan 281 rule).
- [ ] The orbiter glides from 30 km with a lift-to-drag ratio of at least 3 (sim test).
- [ ] `bun run lint`, `bun run typecheck`, `bun run test` and the web vitest suite with `CI=true` pass; `bun run docs:check` passes.
- [ ] Catalogue icons and a Hangar screenshot of every new part in the journal.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/295-shuttle-parts.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers, and the mission table (§11).

## Log

- 2026-10-24 — Parts delivered by plan 303 (and 356/361/309/330); remaining flight tests moved to plan 389. Dropped with the owner's approval.
- 2026-10-21 — Parts delivered in plan 303: orbiter nose and aft, delta wing, external tank, cargo bay. Open: the glide test.
- 2026-10-21 — Drafted from the owner's mission targets of 2026-10-21 (Apollo 11, Space Shuttle, station, rover, orbiter, space telescope, research satellite): rocket parts first, rover after, robotics last.
