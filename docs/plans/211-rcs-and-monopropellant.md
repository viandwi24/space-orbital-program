---
id: 211
title: RCS thrusters and monopropellant
status: done
owner: "Worker A"
depends: [208, 216]
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 211 — RCS thrusters and monopropellant

## Goal

A vessel can carry RCS. A four-way monopropellant block and a small cold-gas thruster rotate and translate the vessel. `R` toggles RCS, H N I J K L translate, and Caps Lock gives fine control. Monopropellant tanks (radial and inline) and a small reserve in the pod feed them. The navball shows an RCS indicator, and thrusters puff and hiss when they fire.

## Context

- Rancangan §4.2 (RCS rows, monoprop tank row, RCS block 1 kN reference), §11.3 (RCS puffs).
- ADRs: 0203 (KSP-grade parts pack: resources and RCS), 0049 (SAS in the sim with module authority), 0174 (part action descriptors), 0206 (key profiles, from plan 216), 0062 (procedural audio), 0216 (RCS allocation, translation, SAS authority).
- Research: 15a §4 "MISSING: RCS and monopropellant"; the closest thing is the EVA jetpack, the stock engine on cold gas at 50 N (`mods/stock/src/eva.ts:28-29, 58-73`). 05 §3.1: the RCS pill is hard-disabled with "No RCS yet" (`apps/web/src/lib/hud/SasButtons.svelte:43`), and R and H/N/I/J/K/L are not bound. 03 §1.2 and §4 list what KSP shows per RCS part.
- Depends on 208 (the `monopropellant` resource and the cold-gas rename) and 216 (R, translation keys and Caps Lock in the KSP profile).

## Scope

**In:**
- An `rcs` module: a set of nozzles (position, direction, max thrust, Isp vac/ASL, propellant) that fires each nozzle in proportion to the torque and translation it can give.
- Translation axes on the `attitude` command, and a vessel `rcs` on/off flag.
- RCS authority reported to SAS like wheels and gimbals (ADR 0049), so SAS uses RCS when it is on.
- Parts: RCS block (four nozzles, monoprop, 1 kN each), small cold-gas thruster (one nozzle), radial and inline monoprop tanks, a monoprop reserve in the command pod.
- Descriptors: on/off, thrust limiter, rotate and translate switches.
- `stock.rcs` action group; R toggles it.
- Fine control (Caps Lock): input scaled to 0.25.
- Navball RCS indicator (on, off, no propellant) next to SAS; the pill in `SasButtons.svelte` becomes live.
- RCS puff effect and a short hiss.

**Out:**
- Per-axis toggles (P1 per rancangan §7.6b).
- Docking mode and its camera (plan 222).
- Final audio mix and the shared sound set (plan 227 tunes the hiss).
- Vernor or other LF/Ox RCS.

## Touches

- **Size:** M
- **Edits:**
  - `mods/stock/src/modules.ts` (new `rcs` module) or a new `mods/stock/src/rcs.ts` beside it
  - `mods/stock/src/parts.ts` (RCS block, cold-gas thruster, two monoprop tanks, pod reserve)
  - `mods/stock/src/action-groups.ts` (`stock.rcs`)
  - `mods/stock/src/steering.ts` (RCS in the mixer)
  - `packages/sim/src/sas.ts` (RCS authority)
  - `packages/core/src/protocol.ts` (`attitude` gains `translate`; `set-rcs` command; `VesselSnapshot.rcs`)
  - `apps/web/src/lib/flight-loop.ts`, `apps/web/src/lib/keybindings.ts` (translation and precision actions, if 216 has not added them)
  - `apps/web/src/lib/hud/SasButtons.svelte`, `apps/web/src/lib/hud/navball-draw.ts`
  - `packages/renderer/src/effects/` (new `rcs-puff.ts`), `packages/renderer/src/parts/generators/` (RCS block and tank generators)
  - `apps/web/src/lib/audio/params.ts`, `apps/web/src/lib/audio/director.ts`
- **Shared contracts:** `attitude` command shape (additive field), new `set-rcs` command, `VesselSnapshot.rcs`. The `monopropellant` and `cold-gas` resource ids come from 208.

## Design notes

- Nozzle allocation: for each nozzle, thrust = clamp(dot(nozzle force direction, requested translation) + dot(nozzle torque about CoM, requested rotation), 0, 1) × limiter × max. This is the KSP behaviour without an optimiser, and it is deterministic.
- The `rotate` and `translate` switches remove a nozzle's share from one input, as in KSP.
- SAS only commands RCS when the vessel `rcs` flag is on. Wheels stay first; RCS adds to the authority.
- Fine control scales pilot input only, not SAS.
- Numbers start from the KSP reference (block 1 kN, Isp 240 vac / 100 ASL). Balancing notes go in the journal.

## Steps

1. Sim: `rcs` module, nozzle allocation, propellant draw through the existing flow (`packages/sim/src/resources.ts`), `set-rcs` command, snapshot flag. Unit tests.
2. Parts and generators: RCS block, cold-gas thruster, monoprop tanks, pod reserve; descriptors and `stock.rcs` group.
3. SAS: report RCS authority; SAS uses it when RCS is on.
4. Input: translation axes and Caps Lock fine control from the 216 profile; R toggles the group.
5. HUD: live RCS pill and navball indicator, with text states.
6. Effects and sound: puffs per firing nozzle, a hiss scaled by total RCS thrust.
7. Chromium e2e with the debug API.

## Acceptance criteria

- [x] `bun test mods/stock/test/rcs.test.ts` passes: a four-block ring with translate +X gives net force along +X and torque under 1 % of the rotate case; with `translate` off a block gives no force for a translation request; propellant drops by thrust × time / (Isp × g0).
- [x] `bun test packages/sim/test/rcs-sas.test.ts` passes: a probe with RCS on and no wheel holds prograde within 2° after 20 s; with RCS off it does not.
- [x] `apps/web` vitest `lib/keybindings.test.ts` asserts R toggles RCS and H N I J K L map to translation in the KSP profile.
- [x] Chromium e2e `e2e/rcs.e2e.ts`: `window.__orbitalDebug.setOrbit` puts an RCS probe in low orbit; press R, the RCS pill reads "RCS on"; hold H for 2 s, the monoprop gauge drops and the speed changes; empty the monoprop with `debug.setResource`, the pill reads "RCS: no propellant".
- [x] `bun run check:affected` passes.
- [x] CI is green on the plan's ready tag (full suite, ADR 0126).

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/211-rcs-and-monopropellant.md` written, with the balancing numbers.
- [x] `docs/architecture/simulation.md` updated (RCS module, allocation, SAS authority).
- [x] `docs/architecture/plugin-system.md` updated if the `rcs` module is exposed to mods.
- [x] New ADRs written for any decision made here, linked above.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-19 — Worker A: refined against the code and implemented on `rel/211-rcs` (ADR 0216).
- 2026-10-19 — Worker A, deviations from the plan as written:
  - The vessel RCS switch is the `set-rcs` command (R and the pill), not a `stock.rcs` action group: a module action cannot set a vessel flag.
  - The navball has no separate mark; the RCS pill beside SAS reads "RCS on", "RCS off" or "RCS: no propellant".
  - The pod's 10 u monoprop reserve starts empty, so the reference rockets keep their mass and the frozen flights hold.
  - Classic translate-back is on `'`, because N stays the classic mute.
- 2026-10-19 — Checks:
  - `CI=true bun run check:affected --e2e e2e/rcs.e2e.ts` all passed (260 s);
  - web vitest 1112/1112;
  - key-profiles, smoke and vessel-switch e2e 10/10;
  - `rcs-sas.test.ts`: 0.69° with RCS, 154° without;
  - CI green on `ready/211` (`refs/ci/pass/1076c434`).
