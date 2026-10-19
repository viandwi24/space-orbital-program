---
id: 222
title: Docking ports and docking
status: in-progress
owner: "Worker A"
depends: [221, 207, 211]
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 222 — Docking ports and docking

## Goal

Two vessels can dock. Docking ports in three sizes pull each other in when they are close, aligned and slow. The two vessels become one vessel with one design record. Undocking splits them again and restores each name and type. Crossfeed through the joint is a toggle. The HUD shows an alignment indicator when the target is a port, and the camera can lock to the port (hook for plan 226).

## Context

- rancangan §6.2 (docking), §4.2 (docking port row; port sizes 0.625 / 1.25 / 2.5 m), §7.6b (docking port controls: Undock, Control from here, Set as target, crossfeed).
- Research: 15c §3 "Missing: docking", no docking command exists, only a "Docking" action-group label (`mods/stock/src/action-groups.ts:11`). Doc 14 marks docking as a gap against KSP1 and KSP2 0.1.3. Doc 08 covers KSP docking behaviour (magnet range, acquire, capture, undock).
- Target and rendezvous aids already exist: `apps/web/src/lib/hud/TargetPanel.svelte:58-95`, `apps/web/src/lib/target-model.ts`, `apps/web/src/lib/rendezvous-aids.ts:99-291` (15c §3).
- ADRs: 0208 (vessel switching, per-vessel designs, docking; amends 0118 point 5), 0203 (node sizes and adapters), 0018 (rigid compound bodies, re-formed on attach), 0084 (target markers and rendezvous aids).
- Plans: 221 (per-vessel design records, `[`/`]`), 207 (explicit node sizes), 211 (RCS translation, needed to fly a docking approach).

## Scope

**In:**
- Three port parts (0.625, 1.25, 2.5 m) with a `docking-port` module. States: ready, acquiring, docked, disengaging.
- Capture rule: same size, inside magnet range, inside an alignment cone, closing speed under a limit. Numbers start from KSP references and are recorded in ADR 0208.
- Merge on capture: one vessel, one compound body (ADR 0018), one merged design record that remembers both source designs.
- `undock` command: splits at the port pair, restores each side's name, type and design record, adds a small separation impulse.
- Crossfeed toggle per port (default on).
- Port controls in the part descriptor: Undock, Control from here, Set as target, Crossfeed.
- Alignment indicator in the Target panel when the target is a port: angle error, lateral offset, distance, closing speed, each with text.
- A port reference frame in the snapshot that plan 226 uses for the Locked camera.
- Milestones: first docking, first undocking.
- Save round-trip and determinism.

**Out:** angle snap (P1). Docking in the Hangar. The docking lesson (plan 229). The Locked camera mode itself (plan 226). Contracts for docking (plan 231).

## Touches

- **Size:** L
- **Edits:**
  - `mods/stock/src/parts.ts`, `mods/stock/src/modules.ts`, `mods/stock/src/action-groups.ts` (ports, module, Docking group)
  - `packages/sim/src/vessel.ts`, `packages/sim/src/commands.ts`, `packages/sim/src/resources.ts`, `packages/sim/src/snapshot.ts`, `packages/sim/src/save.ts`
  - `packages/core/src/protocol.ts`, `packages/core/src/save.ts`, `packages/core/src/milestones.ts`
  - `packages/renderer/src/parts/generators/` (new docking-port generator, covered by the plan 207 seam tests)
  - `apps/web/src/lib/hud/TargetPanel.svelte`, `apps/web/src/lib/target-model.ts`
  - `apps/web/e2e/docking.e2e.ts` (new)
- **Shared contracts:** protocol commands `undock` and `set-crossfeed`; snapshot fields for port state and port frame; `SIM_SAVE_VERSION` bump (now 8, `packages/core/src/save.ts:31`) with a migration step.

## Design notes

- Capture runs in the sim tick on flight vessels only. Two on-rails vessels never dock.
- The merged vessel keeps the active vessel's id. The other id is retired but remembered in the merged record so undock can bring it back.
- Crossfeed off means the port acts as a `crossfeed:false` barrier for stack flow, the same rule decouplers use today.
- The indicator is text first: "Aligned 2.1° · offset 0.4 m · closing 0.3 m/s". Colour is extra.

## Steps

1. Port parts, module and generator; seam tests pass for all three sizes.
2. Capture and merge in the sim; determinism test (two runs, same JSON).
3. `undock` with name, type and design restore; save migration.
4. Crossfeed barrier and flow test.
5. Snapshot port frame and state; part descriptor controls; Docking action group.
6. Alignment indicator in the Target panel; milestones.
7. Chromium e2e using the plan 203 debug API.

## Acceptance criteria

E2E setup uses the plan 203 debug API (ADR 0200). This plan does not depend on 203; if 203 is not done yet, set up with `launchTwoStage` and `runScript` from `apps/web/e2e/support.ts` and record that in the Log.

- [ ] `bun test packages/sim` passes, including `test/docking.test.ts`: two vessels set 5 m apart with aligned ports and 0.2 m/s closing speed become one vessel within 10 s; at 3 m/s or 30° off-axis they do not.
- [ ] Same test file: undock restores both original names, types and design ids; total mass is conserved to 1e-9 relative.
- [ ] Same test file: with crossfeed off, the far side's tanks do not drain; with it on, they do.
- [ ] Determinism: the docking scenario run twice gives identical snapshots.
- [ ] `bun test packages/core` passes, including the save migration from version 8.
- [ ] Chromium e2e `apps/web/e2e/docking.e2e.ts`: set up with `debug.setOrbit` (plan 203) two port-equipped vessels 20 m apart in low orbit; target the port; the indicator text shows angle and offset; translate in with RCS; the HUD shows one vessel; Undock gives two vessels in the vessel list with their old names.
- [ ] `bun run check:affected --build --e2e e2e/docking.e2e.ts` passes.
- [ ] CI is green on the `ready/*` tag for this plan (`refs/ci/pass/<sha>`).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/222-docking.md` written.
- [ ] `docs/architecture/simulation.md` updated (merge and split, port module, crossfeed).
- [ ] ADR 0208 linked and its capture numbers confirmed.
- [ ] `docs/product/glossary.md`: docking port, capture, crossfeed.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
