---
id: 210
title: "SRBs, launch clamps, vacuum engine, 2.5 m class, engine tweakables, basic science parts"
status: in-progress
owner: "Worker A"
depends: [207, 208]
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 210 — SRBs, launch clamps, vacuum engine, 2.5 m class, engine tweakables, basic science parts

## Goal

The first-flight parts a KSP player expects are in the game. Solid rocket boosters in several sizes burn solid fuel with no throttle and a thrust limiter; the BST-1 becomes a true SRB. Launch clamps grow to the pad, hold the rocket, supply EC and release on staging. A vacuum upper-stage engine and the 2.5 m class (tanks, engine, decoupler, heat shield) exist. Engines get a numeric thrust limiter and gimbal lock and limit, and two Goo / Materials Bay style experiments join the science parts.

## Context

- rancangan §4.2 (SRB, clamp, vacuum engine, 2.5 m class, basic experiments; "launch infrastructure"), §4.3 (engine controls), §5.4; owner questions §15 #8 and #16.
- Research: `refs/reverse-engineering-ksp-ksp2/09-parts-catalogue.md`, `07-physics-aero-heat-structure.md`, `03-part-control-and-tweakables.md`; `15a-physics-audit-raw.md` §4 and §9; `15d-parts-science-crew-audit-raw.md` A1 and A6.
- Evidence:
  - `stock.booster` (BST-1) is a liquid-fuel booster with its own tank (`mods/stock/src/parts.ts:358-406` before the plan 207 split), though `mods/stock/src/tech.ts:51` says "solid boosters".
  - Engine model: `mods/stock/src/engine.ts:38-77` (two-point Isp, mass flow, propellant split); gimbal `mods/stock/src/modules.ts:152-191`.
  - Launch clamps removed with the pad hold in ADR 0019; the pad towers are decoration only (rancangan §4.2).
  - Existing booster tests: `packages/sim/test/booster-ascent.test.ts`.
- Solid fuel comes from plan 208; node sizes, adapters and the split part files from plan 207.
- ADRs: 0203 (SRB, launch clamps).
- Defaults per owner review; may change: BST-1 becomes a true SRB and more sizes are added (rancangan §15 #8); clamps supply EC only, not fuel (rancangan §15 #16).

## Scope

**In:**
- SRB engine mode: solid fuel, no throttle (always 100 % of the limiter once lit), cannot shut down; thrust limiter set in the Hangar and in flight before ignition. BST-1 converted; one smaller and one larger SRB.
- Launch clamp part: radial, auto height to the pad surface, holds the vessel fixed, supplies EC, released by staging; refuses placement off a pad with a reason.
- Vacuum upper-stage engine (high vacuum Isp, poor sea-level Isp).
- 2.5 m class: two tanks, one engine, decoupler, heat shield (adapters and cones are plan 207).
- Engine tweakables: thrust limiter with a number; gimbal lock and gimbal limit.
- Two basic experiments (Goo and Materials Bay style) with Run, View, Transmit and Reset.
- Save migration for existing BST-1 designs (LF/Ox contents replaced by solid fuel at equal Δv class).

**Out:** independent throttle (P1); umbilical towers that feed fuel (P1); experiment picker UI (plan 231).

## Touches

- **Size:** L
- **Edits:** `mods/stock/src/engine.ts` (solid mode), `mods/stock/src/modules.ts` (thrust limiter, gimbal lock and limit), `mods/stock/src/launch-clamp.ts` (new module), `mods/stock/src/science.ts` (two experiments), `mods/stock/src/parts/engines.ts`, `parts/tanks.ts`, `parts/structure.ts`, `parts/science.ts` (from plan 207), `mods/stock/src/tech.ts` (place parts in existing nodes until plan 231), `packages/sim/src/frames.ts` (clamp hold as a fixed joint to the ground tile), `packages/sim/src/vessel.ts` (clamp release), `packages/core/src/save.ts` (BST-1 migration), `packages/renderer/src/parts/generators/` (SRB, clamp, vacuum bell, 2.5 m variants)
- **Shared contracts:** **part modules** (engine `mode: 'solid'`, `stock.launch-clamp`; limiter and gimbal fields in the snapshot, read by plans 214 and 218); **save** (BST-1 migration, `SIM_SAVE_VERSION` bump).

## Design notes

- A clamp is a part that the sim joins to the ground tile while attached; staging cuts both the part joint and the ground joint in the same step, so the rocket keeps the momentum it had (zero).
- Clamp auto height is computed at launch from the pad height under the part, not in the Hangar, so one design works on every site.
- The limiter scales mass flow; for an SRB it also scales burn time.

## Steps

1. Solid engine mode and limiter; BST-1 conversion and save migration; two more SRBs.
2. Gimbal lock and limit; descriptors for the panel.
3. Launch clamp module, auto height, hold, EC and release on staging.
4. Vacuum engine and the 2.5 m class parts with generators.
5. Two basic experiments.
6. Tests and e2e.

## Acceptance criteria

- [ ] `bun test mods/stock` passes, including `test/srb.test.ts`: an SRB ignores throttle, burns to empty and cannot shut down; at a 50 % limiter its burn time doubles.
- [ ] `bun test packages/sim` passes `test/launch-clamp.test.ts`: a clamped rocket at full thrust does not move before staging; after staging it rises; EC stays full while clamped.
- [ ] `bun test packages/sim` passes `test/booster-ascent.test.ts` (updated for the solid BST-1).
- [ ] `bun test packages/core` passes the BST-1 save migration test.
- [ ] `bun test packages/renderer` passes `test/part-seams.test.ts` (from plan 207) for every new generator.
- [ ] `bun test mods/stock` passes the part-id snapshot (new parts only, existing ids unchanged).
- [ ] Chromium e2e `e2e/clamps-and-srb.e2e.ts`: launch a design with two clamps and two SRBs; the vessel stays on the pad until the first stage; after staging the SRBs burn out and the HUD shows no throttle effect on them.
- [ ] `bun run check:affected --e2e e2e/clamps-and-srb.e2e.ts` passes.
- [ ] CI green on the `ready/210` tag (`refs/ci/pass/<sha>`, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/210-propulsion-and-structure-pack.md` written.
- [ ] `docs/architecture/simulation.md` updated (solid engines, clamps).
- [ ] ADR 0203 linked; ADR 0019 notes clamps are back as parts.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-19 — Worker A. Defaults (owner rule, rancangan §15 #8 and #16, ADR 0203), recorded here:
  - The open design points are in ADR 0219: the solid mode, flow `none` as the part itself, the clamp hold through an `anchor` hook (not a joint to the ground tile), save format 10 and the held experiments.
  - The thrust limiter is set in flight before ignition (the part panel). The Hangar setting needs per-part settings in designs, which plan 218's part inspector adds; recorded as a follow-up.
  - "Refuses placement off a pad": a clamp holds only within 40 m of the ground (so not in orbit or after a debug teleport); the Hangar warning goes to plan 218's pre-flight report.
  - The new parts sit in existing tech nodes (clamp in Basics, SRBs and the vacuum engine in Propulsion, 2.5 m in Structures, the experiments in Instruments) until plan 231.
  - Reset of a held experiment needs no crew for now (KSP needs a scientist or a lab).
