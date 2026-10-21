---
id: 286
title: "Mission blueprints: Apollo 11 (Kronos V + Selene), Space Shuttle (Ulang-Alik), a space station, an orbiter, a space telescope and a research satellite"
status: draft
owner: ""
depends: [276, 277, 278, 280, 281, 285, 295, 296, 297, 298]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 286 — Mission blueprints: Apollo 11 (Kronos V + Selene), Space Shuttle (Ulang-Alik), a space station, an orbiter, a space telescope and a research satellite

## Goal

The owner's goal is to clone famous missions. This plan ships one complete blueprint per target mission, each with crew or probe control, RCS, power, antenna, life support where crewed, chutes and heat shield where it returns, labelled, and flown headless to its goal: Apollo 11 (Saturn-V-like Kronos V, command and service module, lunar lander; to the moon and back), Space Shuttle (orbiter, external tank, two SRBs, a satellite in the bay; to orbit, open the bay, release, glide home), a space station (assembled from two or three launches; docking), a planetary orbiter (probe to orbit the moon), a space telescope (to orbit, door open, observe) and a research satellite (to orbit, deploy panels and instruments).

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0263, 0255
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** The six designs and their launch vehicles, liveries, labels, checklists; the headless mission tests listed in the steps. The rover mission is plan 287 (after the rover parts).
**Out:** The other real rockets (287).

## Design notes

Names and part lists from the tracker §9.

## Steps

1. Apollo 11: Kronos V + Selene: headless moon landing and return.
2. Shuttle: Ulang-Alik: orbit, open the bay, release the satellite, de-orbit and glide.
3. Station: two launches, dock, crew transfer.
4. Orbiter: probe to lunar orbit.
5. Space telescope: orbit, open door, observe the moon.
6. Research satellite: orbit, deploy, run its instruments.

## Acceptance criteria

- [ ] Each blueprint passes the Hangar launch checks and completes its mission headless (`bun run test`).
- [ ] `bun run lint`, `bun run typecheck`, `bun run test`, web vitest with `CI=true` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/286-real-rocket-blueprints-wave-1.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Re-scoped to the owner's mission targets: famous missions first, other real rockets later.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
