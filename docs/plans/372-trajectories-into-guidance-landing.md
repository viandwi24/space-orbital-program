---
id: 372
title: "The landing prediction moves into the Guidance Landing tab, with a landing target the autopilot steers to; the Trajectories mod is removed"
status: in-progress
owner: "rendezvous session (Claude)"
depends: [332, 366]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 372 — Trajectories into the Guidance Landing tab

## Goal

The predicted path to the ground, its impact cross-hair and the landing target live in the Guidance Computer's Landing tab; the Land autopilot flies to the target; the separate Trajectories mod is gone.

## Context

- Owner (2026-10-22): "trajectory udah dihapus aja modnya pindah ke guidance aja sebagai mod di auto landing aja sekalian".
- Plans 347, 366; ADRs 0296, 0307, new **0309**.

## Scope

**In:** move `predict.ts` and the overlay drawing into `mods/guidance`; the Landing tab (toggle, readouts, pick, target buttons); `guidance.land` with a target; `PilotBody.rotation`; remove `mods/trajectories` and every reference; guide and lesson text.
**Out:** engines in the prediction (it stays a coasting path).

## Acceptance criteria

- [ ] `bun test mods/guidance`: the Landing tab's predicted impact matches a headless drop within about 2 %; the overlay shows only under the ADR 0309 point 3 conditions; Land with a target on the moon comes down near it.
- [ ] No `trajectories` package, built-in, or Mods page entry; `bun run build` passes.
- [ ] `bun run typecheck`, `bun run test`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row.
- [ ] `docs/journal/372-trajectories-into-guidance-landing.md`.
- [ ] Mod guide: the overlays walk-through points at the Guidance Computer.

## Log

- 2026-10-22 — Started by the rendezvous session on the owner's request.
