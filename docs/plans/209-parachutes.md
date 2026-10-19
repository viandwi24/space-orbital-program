---
id: 209
title: Parachutes
status: done
owner: "Worker B"
depends: [207]
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 209 — Parachutes

## Goal

Top, radial and drogue parachutes exist and work like KSP since 1.2. Staging arms a chute; it semi-deploys at its minimum pressure and fully deploys at its full-deploy altitude; "deploy when safe" is the default, so it waits until the speed is safe instead of tearing. The part panel shows the state in text (Safe / Risky / Unsafe, Armed, Semi-deployed, Deployed, Cut, Torn) with Deploy, Force deploy, Disarm and Cut. Chutes have a visual and a deploy sound.

## Context

- rancangan §4.2 (chute row, KSP reference table, "how parachutes work"), §5.2, §11.3; owner question §15 #3.
- Research: `refs/reverse-engineering-ksp-ksp2/07-physics-aero-heat-structure.md` (parachute model), `09-parts-catalogue.md`, `03-part-control-and-tweakables.md`, `16-verification-log.md` (main 0.04 atm / 1000 m; drogue 0.02 atm / 2500 m; risky from about 250 m/s); `15a-physics-audit-raw.md` §7 ("Parachutes: MISSING", only the action-group id at `mods/stock/src/action-groups.ts:13`); `15b-presentation-release-audit-raw.md` §1b (no parachute visuals).
- Drag is per part (`packages/sim/src/aero.ts:1-10`, `packages/sim/src/frames.ts:546-553`); part actions and descriptors from plan 110 (`packages/core/src/panels.ts`).
- Parts go into `mods/stock/src/parts/aero.ts` (or a `parts/recovery.ts` family file) from plan 207.
- ADRs: 0203 (parachute model).
- The pod has no built-in chute; the starter template includes one. Default per owner review (rancangan §15 #3); may change.

## Scope

**In:**
- `ModuleParachute` with states `stowed`, `armed`, `semi`, `full`, `cut`, `torn`; config min pressure, full-deploy altitude, spread angle, mode (`when-safe` | `immediate`); safety from speed and dynamic pressure.
- Parts: top chute (1.25 m), radial chute, drogue; registered in staging and the `stock.parachutes` group.
- Physics: semi-deployed and fully deployed drag area and Cd; deploy over a short time; tearing above the unsafe limit when forced or in `immediate` mode.
- Panel controls from descriptors: Deploy, Force deploy, Disarm, Cut, safety text, min pressure, full-deploy altitude.
- Renderer: canopy visual for semi and full states.
- Audio: deploy one-shot (ADR 0062 style).
- Starter template gets a chute.

**Out:** repack on EVA (P1); per-chute Hangar tweak UI beyond the inspector (plan 218 shows it); the shared audio pack (plan 227 adds the rest).

## Touches

- **Size:** L
- **Edits:** `mods/stock/src/parachute.ts` (new module), `mods/stock/src/parts/` (chute parts in their family file), `mods/stock/src/action-groups.ts`, `mods/stock/src/index.ts`, `packages/sim/src/aero.ts` (area hook for deployed state), `packages/renderer/src/parts/generators/` (`parachute.ts`, new) and a canopy effect in `packages/renderer/src/effects/`, `apps/web/src/lib/audio/` (deploy cue), `apps/web/src/lib/editor/examples.ts` (starter template)
- **Shared contracts:** **part module** `stock.parachute` (state in the snapshot; read by plans 214, 218, 229); **sim events** (`parachute:deployed`, `parachute:torn`).

## Design notes

- Module state lives in the sim; the panel and the renderer read it from the snapshot (ADR 0205 rule: state always from the sim).
- The safety class uses the same thresholds the module uses to tear, so the text never lies.
- Drag of a deployed canopy is applied at the part as an extra area with its own Cd; the existing per-part drag path does the rest.

## Steps

1. `ModuleParachute` states and transitions with sim tests.
2. Drag model for semi and full; tearing; staging and the Parachutes group.
3. Parts (top, radial, drogue) with KSP-based numbers; starter template.
4. Panel descriptors and the safety text.
5. Canopy visual and deploy sound.
6. E2e with a debug drop.

## Acceptance criteria

- [x] `bun test mods/stock` passes, including `test/parachute.test.ts`: an armed chute stays stowed above its min pressure, semi-deploys at 0.04 atm and fully deploys at 1000 m; in `when-safe` mode at 400 m/s it waits; forced at 400 m/s it tears.
- [x] `bun test packages/sim` passes `test/parachute-descent.test.ts`: a pod with one top chute dropped at 5 km and 250 m/s lands below 8 m/s.
- [x] `bun test packages/renderer` passes `test/parachute.test.ts`: the canopy mesh exists for `semi` and `full` and not for `stowed`, `cut` or `torn`.
- [x] `apps/web` vitest: the part panel shows "Unsafe" with text for a fast descent fixture, and Deploy, Force deploy, Disarm and Cut buttons.
- [x] Chromium e2e `e2e/parachute.e2e.ts`: `debugSetLocation` a pod with a chute at 5 km and 200 m/s; stage; the panel reads Armed, then Semi-deployed, then Deployed; the vessel lands intact.
- [x] `bun run check:affected --e2e e2e/parachute.e2e.ts` passes.
- [x] CI green on the `ready/209` tag (`refs/ci/pass/<sha>`, ADR 0126).

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/209-parachutes.md` written.
- [x] `docs/architecture/simulation.md` updated (parachute model).
- [x] ADR 0203 linked.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-19 — Worker B. "Deploy when safe" waits while the air is Unsafe, not until it is Safe: a capsule's terminal speed at 5 km is about 260 m/s, past the 250 m/s Risky line, so waiting for Safe never opened the chute (the descent test showed it). Risky air opens it with the warning shown; Unsafe air tears an open canopy. The dynamic-pressure limits sit above a capsule's own: at its terminal speed `q = m g / CdA` whatever the height (about 44 kPa for the stock pod), so a main is Risky from 50 kPa and Unsafe from 80 kPa (a first 20/40 kPa never let the chute open low down). The drag is the module's own force at the chute's top (`applyForce`), so `packages/sim/src/aero.ts` is unchanged; the sim gains `Ambient.height` for the full-deploy height. The safety text is a new `ModuleInfo.readouts` list the part panel shows. The e2e drops from 8 km at 800 m/s instead of 5 km at 200 m/s (plan 212's transonic drag brakes a capsule from 400 m/s in about a second): at 200 m/s the chute is already allowed to open, so Armed would last one step. The starter template is the Hangar's two-stage example with a chute on the pod, staged last (`starterRocket`); the reference rocket the tests fly is unchanged. The radial chute and the drogue are in the Aerodynamics node, the main in Basics (plan 231 may move them).
