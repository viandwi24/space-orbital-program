---
id: 109
title: "EVA: crew as actors outside the vessel"
status: in-progress
owner: "Agent 1"
depends: [106, 103]
phase: 6
created: 2026-10-17
updated: 2026-10-18
---

# 109 — EVA: crew as actors outside the vessel

## Goal

A crew member can leave a vessel as a small vessel of their own (suit with propellant and a jetpack), walk or float, plant a flag, take a surface sample, board again, and be recovered; EVA time counts for XP and milestones.

## Context

- ADRs: 0100
- Read: ADR 0100 point 5, ADR 0018 (compound bodies), 0019 (ground), 0024 (surface rails).

## Scope

**In:**
- EVA vessel definition (stock part kind "suit"), exit and board commands with hatch positions.
- Walking on the ground tile (simple character controller) and jetpack in space.
- Flag and surface sample actions (sample through 103).
- Renderer: a procedural suited figure (no KSP likeness).

**Out:** suit radios (121), base building by hand.

## Touches

- **Size:** L
- **Edits:** `packages/sim`, `packages/physics`, `mods/stock`, `packages/renderer/src/parts`, `apps/web/src/lib/hud`
- **Shared contracts:** **protocol (EVA commands), save (EVA vessels)**

## Design notes

The suited crew member is a vessel like any other so saves, targets and the map need no special case.

## Steps

1. Exit and board.
2. Movement models.
3. Actions.
4. Renderer figure.

## Acceptance criteria

- [ ] `packages/sim` test: exit then board returns the crew member to a seat with the vessel mass restored.
- [ ] `packages/sim` test: a suit on the moon walks 10 m and stays on the ground tile; in orbit the jetpack changes velocity by its Δv.
- [ ] Screenshot of an EVA on the moon in the journal.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/109-eva-crew-outside-the-vessel.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0100).
- 2026-10-17 — `depends` gains 103 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): the surface sample action goes through the science core of plan 103.
