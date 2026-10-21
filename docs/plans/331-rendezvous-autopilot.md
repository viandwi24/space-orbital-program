---
id: 331
title: "Rendezvous autopilot in the Guidance Computer: plane, transfer, match, close and hold, with a hand-over to Auto Dock"
status: in-progress
owner: "rendezvous session (Claude)"
depends: [321, 330]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 331 — Rendezvous autopilot

## Goal

A vessel in orbit with a target (a vessel or a docking port) is flown automatically from any distance to 100–200 m from the target, at rest relative to it, like MechJeb's rendezvous autopilot. From there the player engages Auto Dock (which starts within 250 m), or the rendezvous hands over to it when "Dock when close" is ticked.

## Context

- Owner's question (2026-10-22): how to dock from more than 250 m; he mentioned MechJeb's rendezvous tool.
- ADRs 0271 (autopilots), 0277 (pilot read-outs), 0285 (settings and logs), 0084 (rendezvous aids), 0202 (warp), new **0286**.
- Code: `mods/guidance` (node executor), `mods/autodock`, `packages/kepler/src/rendezvous.ts`, `packages/core/src/vessel-pilot.ts`, `packages/sim/src/pilot-facts.ts`.

## Scope

**In:** `guidance.rendezvous` and its panel; `warpTo`, `engage` and `propellantMass` on the pilot; the kepler aids re-exported from the SDK; headless sim tests; the guide and the docking lesson text.
**Out:** targets in another sphere of influence, rendezvous with a body, an e2e run.

## Design notes

See ADR 0286. Every burn of the far phases is a maneuver node flown by the plan-321 executor, so the player sees each one on the map. Memory is plain JSON (phase, the node memory, counters).

## Steps

1. ADR 0286 and this plan; commit.
2. Pilot additions (`warpTo`, `engage`, `propellantMass`), SDK re-exports, API 0.1.103; commit.
3. `guidance.rendezvous` with the same-orbit, transfer and fuel tests; commit.
4. Panel, guide section, docking lesson text, STATUS, journal; commit.

## Acceptance criteria

- [ ] `bun test mods/guidance`: two vessels in one 100 km orbit 20 km apart end within 200 m and under 0.5 m/s relative.
- [ ] `bun test mods/guidance`: from 100 km to a target at 150 km inclined 2° it ends the same way.
- [ ] `bun test mods/guidance`: with too little fuel it aborts with a delta-v reason.
- [ ] `bun test mods/guidance`: "Dock when close" with a targeted port hands over to `autodock.dock`.
- [ ] `bun run typecheck`, `bun test`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row.
- [ ] `docs/journal/331-rendezvous-autopilot.md`.
- [ ] Guide section on the rendezvous autopilot; docking lesson text.

## Log

- 2026-10-22 — Drafted and started by the rendezvous session on the owner's request (relayed by the session that started it).
