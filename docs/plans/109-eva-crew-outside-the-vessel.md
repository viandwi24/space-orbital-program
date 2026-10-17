---
id: 109
title: "EVA: crew as actors outside the vessel"
status: done
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

- ADRs: 0100, [0120](../decisions/0120-eva-the-suit-is-a-vessel-commands-walking-jetpack-flag.md) (decisions of this plan)
- Read: ADR 0100 point 5, ADR 0018 (compound bodies), 0019 (ground), 0024 (surface rails), 0176 (crew), 0181 (life support), 0178 (science), 0147 (milestones).

## Scope

**In:**
- The suit as a one-part vessel (`stock.eva-suit`), `crew-eva` and `crew-board` commands (ADR 0120 point 2).
- Walking on the ground (`crew-walk`, a sim-side controller of the ground speed) and the jetpack in space (the stock engine on `stock.eva-propellant`).
- Flag (`plant-flag`, a kept one-part vessel) and surface sample (the stock sampler on the suit; the sample moves aboard into the vessel's sample locker).
- The `eva` milestone and the `eva:<body>` crew place.
- Renderer: procedural `suit` and `flag` figures (no KSP likeness).
- HUD: EVA and Board in the crew panel; the flight focuses the suit with its one-part design.

**Out:** suit radios (121), base building by hand, a full vessel switcher.

## Touches

- **Size:** L
- **Edits:** `packages/core` (protocol, protocol schemas, milestones, crew places, module `keep`), `packages/sim`, `mods/stock`, `packages/renderer/src/parts`, `apps/web/src/lib/hud`, `apps/web/src/lib/flight-loop.ts`
- **Shared contracts:** **protocol (`crew-eva`, `crew-board`, `crew-walk`, `plant-flag`), save (EVA vessels are ordinary vessels; optional `VesselState.samples` and `walk`; milestone kind `eva`)**, SDK (`ModuleDefinition.keep`, `PartDefinition.walk`)

## Design notes

The suited crew member is a vessel like any other so saves, targets and the map need no special case.

## Steps

1. ADR 0120; core contracts (commands, `keep`, milestone kind, place).
2. Stock suit, propellant, walk module, flag; sim exit and board, samples locker, plant-flag request.
3. Tests: exit and board, walking on the moon, the jetpack's Δv, the flag stays, the sample comes aboard.
4. Renderer figures; HUD buttons and focus; screenshot on the moon.

## Acceptance criteria

- [x] `packages/sim` test: exit then board returns the crew member to a seat with the vessel mass restored.
- [x] `packages/sim` test: a suit on the moon walks 10 m and stays on the ground tile; in orbit the jetpack changes velocity by its Δv.
- [x] `packages/sim` test: a planted flag is still there after 60 s; a surface sample taken in the suit is credited when the vessel it boarded is recovered.
- [x] Screenshot of an EVA on the moon in the journal.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/109-eva-crew-outside-the-vessel.md` written.

- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0100).
- 2026-10-17 — `depends` gains 103 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): the surface sample action goes through the science core of plan 103.
- 2026-10-18 — Claimed by Agent 1 and refined: ADR 0120 (suit as a vessel, `crew-eva` / `crew-board`, walking and jetpack as modules, a kept flag, the `eva` milestone); a criterion for the flag and the sample added.
- 2026-10-18 — Done (Agent 1): commands, suit and flag, walking controller with the upright rule, samples aboard, the eva milestone, figures, the crew panel. Journal [109](../journal/109-eva-crew-outside-the-vessel.md).
- 2026-10-18 — Checks: `bun run test` 1553 pass · web vitest 963 pass · typecheck · build · docs:check OK · Chromium smoke 7 pass.
