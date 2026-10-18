---
id: 231
title: Career content for the new parts
status: draft
owner: ""
depends: [209, 210, 211, 222, 225]
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 231 — Career content for the new parts

## Goal

A Career world uses the new parts. Every part added in plans 207–211, 222 and 225 has a place in a larger tech tree. New contract templates ask for rescue, a satellite, a station and a docking. The science panel lets the player pick which experiment to run and which stored result to transmit.

## Context

- rancangan §10.1 (tech tree beyond 10 nodes, with a place for every P0 part; P0 for placing new parts), §10.2 (contract variety: rescue, satellite, station, base, survey; 6 templates today), §10.3 (pick an experiment or result).
- Research 15d:
  - §A7: 10 tech nodes, 1 115 science, gated by milestones (`mods/stock/src/tech.ts:8-115`); KSP has about 60.
  - §B4: no rescue contracts; the six templates are altitude, orbit, moon flyby, moon landing, moon return and planet flyby (`mods/stock/src/contracts.ts:69-185`).
  - §A6: the science dock panel offers only "run next" and "transmit best" (`mods/stock/src/panels.ts:14-30`); no way to pick an experiment or result.
  - Stale: `mods/stock/src/tech.ts:51` calls BST-1 "solid" (plan 210 makes it true).
- Doc 14 lists KSP2 career content for comparison.
- ADRs: 0186 (procedural contracts: templates, offers, slots, value), 0194 (science dock panel), 0147 (milestones), 0203 (parts pack), 0208 (docking). No new ADR: this is content within existing models.
- Owner question: pods carry no built-in parachute; the starter template includes one. Default per owner review (rancangan §15 #3); may change. The tech tree puts the first parachute in the starting node.
- Plans: 209 (chutes), 210 (SRBs, clamps, vacuum engine, 2.5 m, basic science parts), 211 (RCS and monoprop), 222 (docking ports), 225 (ladder).

## Scope

**In:**
- Tech tree grown to about 20–24 nodes in tiers, gated by science and milestones as today. Every new part sits in exactly one node. Starting node holds pod, chute, small SRB, fin and decoupler, so a KSP-style first flight is possible.
- Contract templates:
  - **Rescue:** a stranded crew member in a pod in low orbit; board and return them.
  - **Satellite:** reach a given orbit (Ap, Pe, inclination within tolerance) with antenna and power.
  - **Station:** a vessel in orbit with a docking port, N crew seats and power.
  - **Docking:** dock two vessels in orbit of a body.
- Rescue spawns its vessel through the contract offer, using the existing procedural contract slots.
- Science picker: the science panel lists each experiment with Run and each stored result with Transmit and Discard; the old buttons stay as shortcuts.
- Starter Career craft template updated to include a parachute.

**Out:** base and survey contracts, experiment reset and lab (P1). Strategy changes.

## Touches

- **Size:** M
- **Edits:**
  - `mods/stock/src/tech.ts`, `mods/stock/src/contracts.ts`, `mods/stock/src/panels.ts`, `mods/stock/src/missions.ts` (starter text if it names parts)
  - `packages/sim/src/contracts.ts` (rescue spawn on accept), `packages/sim/src/tech.ts` if node data grows new fields
  - `apps/web/src/lib/dock/science-panel.test.ts`
  - `apps/web/e2e/career-content.e2e.ts` (new)
- **Shared contracts:** contract template data only; the panel input already carries experiments and stored results.

## Design notes

- A test reads the part registry and the tech tree and fails when a stock part has no node. New parts in later plans then cannot be forgotten.
- The rescue vessel is a normal vessel with a `contract` tag, so fleet management (plan 223) lists it and recovery credits the contract.

## Steps

1. Tech tree layout and the "every part has a node" test.
2. Rescue template with its spawn.
3. Satellite, station and docking templates.
4. Science picker in the panel.
5. Starter template with a parachute.
6. Chromium e2e.

## Acceptance criteria

E2E setup uses the plan 203 debug API (ADR 0200). This plan does not depend on 203; if 203 is not done yet, set up with `launchTwoStage` and `runScript` from `apps/web/e2e/support.ts` and record that in the Log.

- [ ] `bun test mods/stock` passes, including `test/tech-coverage.test.ts`: every stock part id is in exactly one tech node; the starting node contains a pod, a parachute and a solid booster.
- [ ] `bun test packages/sim` passes, including `test/contracts-new.test.ts`: accepting a rescue spawns a crewed pod in orbit; boarding and recovering the crew completes it; a docking contract completes on the first dock event at the named body.
- [ ] `apps/web` vitest: `dock/science-panel.test.ts` covers Run on a chosen experiment and Transmit on a chosen result.
- [ ] Chromium e2e `apps/web/e2e/career-content.e2e.ts`: in a Career world, the R&D page shows the new nodes; with plan 203's cheat "unlock all tech" every new part appears in the Hangar catalogue; the contracts board offers at least one of the new templates after `debug` adds the needed milestones.
- [ ] `bun run check:affected --build --e2e e2e/career-content.e2e.ts` passes.
- [ ] CI is green on the `ready/*` tag for this plan.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/231-career-content-for-new-parts.md` written.
- [ ] `apps/web/src/lib/public/roadmap.ts` updated for contracts and tech tree.
- [ ] `docs/product/spec.md` updated if it lists the tech nodes or contracts.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
