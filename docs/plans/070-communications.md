---
id: 070
title: "Communications: antennas, signal range and delay, loss of control in a blackout"
status: draft
owner: ""
depends: [040]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 070 — Communications

## Goal

A vessel can lose its link: out of range of the home body, behind a body, or inside the plasma of a re-entry. Plan 040 made the plasma blackout a display (ADR 0079); this plan gives the signal something to lose.

## Context

- Found, not done, in plan 040: the game has no communications system, so the blackout badge says "signal lost" and nothing is lost. `blackoutLevel` (renderer, `effects/reentry.ts`) is the level a system would read.
- Read: ADRs 0023 (heating), 0079 (blackout display), 0039 (scripts and warp), `docs/product/spec.md` on remote control.

## Scope

**In (to be ordered at refinement):**
1. **A link model in the sim**: a module (`antenna` with range and power) and a rule for when a vessel is connected (line of sight to a ground station on the home body, range, no occlusion by the body).
2. **Delay** at long range (a command arrives later), kept deterministic.
3. **Loss of control**: a vessel without a link accepts no attitude or throttle commands from the player and scripts unless it has a probe core with its own autonomy; blackout drops the link while `blackoutLevel` is over the badge level.
4. **HUD**: link state and signal strength next to the badge of plan 040.
5. **Mods**: an SDK hook so a mod defines antennas.

**Out:** relay networks, bandwidth and science transmission.

## Acceptance criteria

- [ ] To be made measurable at refinement.

## Docs checklist

- [ ] STATUS, journal, ADR, `plugin-system.md`, `guides/writing-a-mod.md`.

## Log

- 2026-10-17 — Created as draft by plan 040 (found, not done).
