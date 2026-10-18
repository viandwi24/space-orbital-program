---
id: 219
title: Procedural fairings and interstages
status: draft
owner: ""
depends: [217, 207]
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 219 — Procedural fairings and interstages

## Goal

The player places a fairing base (0.625, 1.25 or 2.5 m) under a payload and builds the shell by clicking sections in the 3D view, with handles and number fields for each section's height and radius. A base can be an interstage that encloses an upper stage's engine. In flight the fairing jettisons through staging (or the inspector's "Jettison" button) into panels that become debris. While closed, it shields the parts inside from drag and heating.

## Context

- Rancangan §8.9 (click to add sections, 3D handles, number fields), §8b.7 (fairings also for interstages), §4.2 (fairing row: "Jettison", staged).
- ADRs: 0207 (Hangar interaction model: procedural fairings), 0203 (node sizes, from plan 207), 0018 (rigid compound bodies), 0021 (debris lifecycle).
- Research:
  - 02 §7 "KSP1 fairing build mode": each click adds a section that tapers within a limit; a label shows mass and cost and is green, orange or blue; interstage needs an "interstage nodes" toggle and an engine counts as shielded only if enclosed. KSP2 uses an edit button and a length slider.
  - 15d §A1 "Missing": ladders, lights, fairings, cargo bays. 15a §1: the only drag shielding is between attached end faces (`packages/sim/src/aero.ts:22-33`).
  - 15a §9: decouplers cut with an ejection impulse (`mods/stock/src/modules.ts:311-361`), and simultaneous cuts resolve together (`packages/sim/src/vessel.ts:497-592`); jettison reuses this path.
- Depends on 217 (editor carry and handles live in the new editor loop) and 207 (explicit node sizes; bases match them).

## Scope

**In:**
- Fairing base parts in three sizes, with a `fairing` module: sections (list of `{ height, radius }`), `interstage` flag, `jettisoned` state.
- Design: per-part settings carry the section list (the settings field from 218 / ADR 0203).
- Hangar: "Edit fairing" mode on a selected base; each click adds a section at the cursor height and radius; drag handles; number fields; the label shows mass, cost and a state (valid, cannot be made, closes) as text and colour; "Close" caps the shell.
- Interstage: a base with `interstage` gains a top node at the shell's top so an upper stage can stack onto it; an engine inside is shielded.
- Geometry generator: revolve the profile into two or more panels; reuse the revolve rules (profile bottom to top).
- Sim: closed shell shields enclosed parts from drag and convective heating; jettison on stage splits panels as debris with a sideways impulse; panels are drawn and then follow the debris lifecycle.
- Descriptors: "Jettison" trigger in flight; staging icon.

**Out:**
- Cargo bays and service bays (P1).
- Fairing panel count and colour options beyond two panels (P1).
- Automatic adapter offer (P1, §8b.6).

## Touches

- **Size:** L
- **Edits:**
  - new `mods/stock/src/fairing.ts` (module), `mods/stock/src/parts.ts` (three bases)
  - new `packages/renderer/src/parts/generators/fairing.ts`, `packages/renderer/src/parts/generators/index.ts`, `packages/renderer/src/parts/revolve.ts` (reuse only)
  - `apps/web/src/lib/editor/state.ts` (fairing edit steps), `apps/web/src/lib/vab/controller.svelte.ts` (edit mode), new `apps/web/src/lib/vab/FairingEditor.svelte`
  - `packages/renderer/src/vab/view.ts` (handles)
  - `packages/sim/src/aero.ts`, `packages/sim/src/thermal.ts`, `packages/sim/src/frames.ts` (shielded parts), `packages/sim/src/vessel.ts` (jettison split)
- **Shared contracts:** the fairing section list inside per-part design settings; a part-level `shieldedBy` set in sim state (not saved: derived at load). The `fairing` module is mod-facing, so its config schema is public.

## Design notes

- Shielding test: a part is inside if every vertex of its collider box lies inside the revolved profile (radius at that height) of a closed shell above the base. This runs only when the design changes or a part leaves, not per step.
- Section limits: taper at most 30° per section; radius between 0.3 m and 2× base radius; total height up to 15 m. These are journal-noted starting values.
- Panels as debris: mass split evenly, impulse 1500 N·s outward, using the decoupler cut path so momentum is conserved (ADR 0018).
- Interstage: the enclosed engine still fires; its plume is not occluded (visual only, accepted).

## Steps

1. `fairing` module and parts; sections in design settings; resolver. Tests.
2. Renderer generator from the section list, two panels, outward faces.
3. Sim shielding (drag and heating) and jettison into debris. Tests.
4. Hangar edit mode: click to add, handles, number fields, status label, Close.
5. Interstage top node and enclosed-engine shielding.
6. Staging icon, "Jettison" descriptor, e2e.

## Acceptance criteria

- [ ] `bun test mods/stock/test/fairing.test.ts`: a closed 1.25 m fairing over a probe reduces the vessel's drag at Mach 0.8 by at least 30 % against the same stack without it; after jettison the drag returns to within 5 % of the bare stack.
- [ ] `bun test packages/sim/test/fairing-jettison.test.ts`: staging the fairing makes two debris vessels; total momentum is conserved to 1e-6.
- [ ] `bun test packages/renderer/test/parts.test.ts` gains a fairing case: every face's normal points outward and the base rim radius equals the node radius within 1 mm.
- [ ] `apps/web` vitest `lib/editor/fairing.test.ts`: three clicks make three sections; a 45° taper is refused with "Too steep"; undo removes the last section.
- [ ] Chromium e2e `e2e/fairing.e2e.ts`: build a probe on a 1.25 m base, add sections and Close in the Hangar, launch; `window.__orbitalDebug.setLocation` puts it at 40 km and 1000 m/s; staging jettisons the fairing and the vessel panel no longer lists the fairing.
- [ ] `bun run check:affected` passes.
- [ ] CI is green on the plan's ready tag (full suite, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/219-procedural-fairings.md` written, with the limit values.
- [ ] `docs/architecture/simulation.md` updated (fairing shielding and jettison).
- [ ] `docs/architecture/plugin-system.md` updated (`fairing` module config).

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
