---
id: 276
title: "Engines remodelled and new: open, shroud, vacuum, vernier, small, engine plates 5/8/9, segmented SRBs, separatron, escape tower"
status: draft
owner: ""
depends: [291, 275]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 276 — Engines remodelled and new: open, shroud, vacuum, vernier, small, engine plates 5/8/9, segmented SRBs, separatron, escape tower

## Goal

Each engine has its own silhouette (open-frame lifter, shrouded large engine, short-head long-bell vacuum engine, four-chamber with verniers, tiny 0.625 m), engine plates cluster 5, 8 or 9 engines (quincunx, ring, octaweb) under one diameter, SRBs are segmented with field joints and aft skirts, and a launch escape tower pulls a pod away on abort.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0257
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** Engine generator split into presets; `ribbedBell` from the kit; engine plates per class; SRB generator; separatron; LES part with the abort action group; engines for L, XL and XXL classes; OrbitX titles.
**Out:** Nuclear, ion and aerospike engines (draft later, tracker ENG-08…10).

## Design notes

Presets are params of one generator family, not separate code paths where they share the bell. Plates are parts with N bottom nodes and a decoupler option. LES: an SRB with angled nozzles and a decoupler that fires on abort or staging.

## Steps

1. Split the engine generator into presets, remodel the three stock engines.
2. Add small and large engines and engine plates.
3. Remodel SRBs and the liquid booster; add separatron and LES.
4. Headless abort test: LES lifts the pod clear of a failing stage.

## Acceptance criteria

- [ ] `bun test packages/sim` passes, including an abort test where the LES carries the pod at least 500 m from the stack.
- [ ] Every engine icon is distinct (journal sheet).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/276-engines-plates-srbs-and-escape-tower.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
