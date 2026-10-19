---
id: 236
title: "Branch space centers on the home planet, linked into the network"
status: draft
owner: ""
depends: [235, 234]
phase: 7
created: 2026-10-19
updated: 2026-10-19
---

# 236 — Branch space centers on the home planet, linked into the network

## Goal

The player founds additional space centers (branches) anywhere suitable on the home planet:
- a site picker on the globe shows flat zones, latitude, coastline and terrain;
- founding costs money, and the HQ takes time to build on the world tick;
- each branch has its own buildings: pads, runway, dishes;
- branches with comms buildings become ground stations of the network.

The Space Center switches between sites. The Launch screen can pick a pad at any site. The status bar names the current site.

## Context

- Owner idea, from earlier and repeated on 2026-10-19: agencies open branch space centers and connect them into a network. See ADR 0222 point 4.
- Existing pieces:
  - sites and site choice at world creation (plan 092; the `found-site` command, `packages/core/src/protocol.ts:788`);
  - placement rules (`packages/core/src/buildings.ts`, ADR 0115);
  - construction on the tick (ADR 0123);
  - off-world sites (plan 128);
  - comms ground stations (plans 114–121);
  - the launch screen (plan 094).

## Scope

**In:**
- Home-planet branch founding: picker, rules, cost, HQ build time.
- Per-site buildings and pads.
- A site switcher at the Space Center, with the location shown in the status bar.
- Launch from any site's pad.
- Comms buildings at a branch register as ground stations.
- Save migration if the site list changes shape.
- Mission Center shows the sites.

**Out:**
- Transfer of goods between sites (later economy).
- Off-world rules (plan 128 unchanged).

## Touches

- **Size:** L
- **Edits:**
  - `packages/core` (sites, rules)
  - `packages/sim` (found-site for home branches, ground stations from buildings)
  - `apps/web/src/lib/space-center/*`
  - the launch screen
  - mission-center model
- **Shared contracts:** the site record gains `kind: 'hq' | 'branch' | 'off-world'` (additive), with a save migration.

## Steps

1. Core: branch rules and costs, plus site kind. Tests.
2. Sim: founding a branch on the home planet, with HQ construction. Comms buildings at any site become ground stations. Tests, including a link from a branch on the other side of the planet.
3. UI: the globe site picker, the site switcher, and the status bar location.
4. Launch from any site's pad, with an e2e.
5. Mission Center shows the sites and their ground-station coverage.

## Acceptance criteria

- [ ] Core and sim tests pass:
  - [ ] a branch founded on the far side of the home planet keeps a probe linked when the HQ has no line of sight;
  - [ ] founding costs are charged;
  - [ ] the HQ completes after its build days.
- [ ] `e2e/branch-sites.e2e.ts` passes on Chromium: found a branch through the picker, use the debug API to finish construction, build a pad and a dish, then launch from the branch.
- [ ] `bun run check:affected` passes, and CI is green on `ready/236`.

## Docs checklist

- [ ] STATUS updated.
- [ ] Journal written.
- [ ] Architecture notes on sites and comms updated.

## Log

- 2026-10-19 — Created from the owner's idea (ADR 0222).
