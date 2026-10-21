---
id: 281
title: "Payload bays with doors, payload petals, multi-couplers, trusses, lattice interstage, structural tubes"
status: draft
owner: ""
depends: [291, 275]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 281 — Payload bays with doors, payload petals, multi-couplers, trusses, lattice interstage, structural tubes

## Goal

Service bays, round cargo bays and Apollo-style payload petals hold parts that are shielded while the doors are closed and can be released only when open; multi-couplers, trusses and hubs, a lattice interstage and structural tubes let players build stations, bases and Soyuz-like stacks.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0261
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** `ModuleBay`, door animations, shield-by-doors rule in `shieldedParts`, decouple refusal, new structural parts, OrbitX titles.
**Out:** Inventory containers (284).

## Design notes

Reuse `ModuleDefinition.shell` profiles; doors add drag when open.

## Steps

1. Module and sim rule with tests.
2. Bay, petals, coupler, truss, interstage, tube generators and parts.
3. A payload deploy test: open bay, release a satellite.

## Acceptance criteria

- [ ] A part inside a closed bay takes no drag or heat; opened, it does (sim test).
- [ ] Decoupling a payload inside a closed bay is refused with a message; open, it separates (sim test).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/281-payload-bays-couplers-and-structure.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Parts delivered in plan 303: service bays, cargo bay, petals, couplers, truss, hub, lattice. Open: the decouple refusal inside a closed bay.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
