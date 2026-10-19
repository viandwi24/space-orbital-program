# 219 — Procedural fairings and interstages

**Plan:** [plans/219-procedural-fairings.md](../plans/219-procedural-fairings.md) · **Session:** Worker A, 2026-10-19 · **ADRs:** [0224](../decisions/0224-per-part-settings-fairings-debris.md), [0207](../decisions/0207-hangar-interaction-model.md) · **Research:** 02 §7, 15a §1, §9, 15d §A1

## What was done

| Where | What |
|---|---|
| `packages/core` | design `settings`, `mass` and `shell` hooks, `VesselApi.spawnDebris`, `PartVisual.paramsFrom`, `visible` articulation, `catalog.hidden`, API 0.1.81 |
| `packages/sim` | settings merged at spawn, `moduleMass`, `debris.ts` (spawned pieces, shielding, the shell's drag shape) |
| `mods/stock` | `stock.fairing` (sections, Close, mass, shell, jettison into two panels), `stock.fairing-panel`, three bases |
| `packages/renderer` | `fairing` and `fairing-panel` generators, per-instance params in the factory, the Hangar and flight scenes |
| `apps/web` | `editor/fairing.ts` (add, change, remove, Close; limits), `setPartSettings`, `FairingEditor.svelte` in the selection card, edit mode click, params in the scene |
| tests | `mods/stock/test/fairing.test.ts`, `packages/sim/test/fairing.test.ts`, `fairing-jettison.test.ts`, the fairing case in `part-seams.test.ts`, `lib/editor/fairing.test.ts`, `e2e/fairing.e2e.ts` |

## Limit values (starting points)

- Taper at most 30° per section; radius 0.3 m to 2× the base radius; height up to 15 m; a closed nose as tall as the last radius.
- Shell 4 kg/m²; 300 N·s per panel outward; a panel stands 0.15 m outside the shell so its small collider starts clear.

## What surprised me

- **Box corners of a cylinder stick out:** a 1.25 m probe's corners reach 0.88 m, outside a 0.8 m shell. The outline now uses points on a cylinder's rims.
- **A shielded payload leaves no drag at all,** so the shell itself must meet the air: the base is drawn as the shell's cylinder with a nose cone's Cd. Bare stack 22.6 kN, faired 14.8 kN (−34 %), jettisoned 22.5 kN at Mach 0.8 and 2 km.
- **Panels spawned inside the payload collided with it.** They now stand outside the shell with a small collider.
- **`spawnVessel` already announces `vessel:created`;** a second emit doubled the debris count.

## Decisions made (link ADRs)

- ADR 0224; the rest in the plan's Log.

## Open questions / follow-ups

- Interstage (nodes that follow settings), 3D section handles, the shell's cost.
- Plan 218: the thrust limiter (plan 210) through the same `settings` field.

## Verification output

```
check:affected --build --e2e e2e/fairing.e2e.ts: all passed in 314.2 s
  bun test (10 workspaces) 1782 pass, 0 fail; typecheck 11 workspaces + web clean
  e2e fairing.e2e.ts (chromium): 1 passed
web vitest (CI=true, full): 1160 pass
sim fairing.test: bare 22.6 kN, faired 14.8 kN, jettisoned 22.5 kN; fairing-jettison.test: 2 panels, momentum to 1e-6
stock fairing.test 3 pass; editor fairing.test 3 pass; renderer part-seams fairing case pass
```
