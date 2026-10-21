---
id: 287
title: "More blueprints: a lunar rover mission, then other famous rockets (Semyorka-S + Persatuan, Rajawali 9 + Naga, Hermes-R, Timur-1, Pengiring-1, Neutron-M, Herkules V, Jalan Jauh 2F, Dioskuri, Lumière 5, Rajawali Berat)"
status: draft
owner: ""
depends: [286, 283]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 287 — More blueprints: a lunar rover mission, then other famous rockets (Semyorka-S + Persatuan, Rajawali 9 + Naga, Hermes-R, Timur-1, Pengiring-1, Neutron-M, Herkules V, Jalan Jauh 2F, Dioskuri, Lumière 5, Rajawali Berat)

## Goal

After the mission set of plan 286 and the rover parts: a lunar rover mission (rover carried on the lander and driven) and the other famous rockets of the tracker §9, each flown headless to its goal.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0263, 0255
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** Designs and tests.
**Out:** —

## Design notes

As 286.

## Steps

1. Rover mission: Penjelajah Selene.
2. The other real rockets, in the order of tracker §9.

## Acceptance criteria

- [ ] Each blueprint reaches its goal headless (`bun run test`).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/287-real-rocket-blueprints-waves-2-and-3.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Re-scoped to the owner's mission targets: famous missions first, other real rockets later.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
