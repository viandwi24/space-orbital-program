---
id: 278
title: "Parachutes and probe cores: a chute that continues the pod, a docking chute ring, slim radial packs, an octagonal probe core"
status: draft
owner: ""
depends: [291]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 278 — Parachutes and probe cores

## Goal

The owner's complaint first: the stack chute is an upright can on the pod and cannot share the apex with a docking port. After this plan (ADR 0260):

- the stack and drogue chutes are short frustums that continue the pod's slope, with a two-tone cap;
- a docking chute ring sits on the pod's apex with a top node for a docking port, its canopies opening around the port;
- the radial chute is a slim rounded pack;
- the probe core is an octagonal, foil-panelled body with a status lamp, not a striped tube.

The new pods moved to plan 300.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0260, 0257
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** the parachute generator (a `taper` parameter, frustum profile, cap, details; radial pack); multi-anchor canopies; `stock.parachute-ring` (sim: a parachute part with a top node); a `probe` generator for `stock.probe-core`; OrbitX titles for the chutes and the probe core.
**Out:** the new pods (plan 300); built-in chutes on a 3-seat pod (300); the lander cabin (296), the cupola (297), the satellite bus (298); the pod collar drawing no step under a chute (needs the renderer to know a part's neighbours; later).

## Design notes

Crew capacity, masses and heat tolerances from the KSP ranges in `refs/reverse-engineering-ksp-ksp2/09-parts-catalogue.md` §1.1 scaled to our pods; the low-mass and blunt-base rule of ADR 0246 applies to every capsule.

## Steps

1. Parachute generator: frustum continuing the pod's slope, cap, details; drogue with a pointed tip; radial pack.
2. Multi-anchor canopies; the docking chute ring part, in the recovery tech node.
3. Probe generator and the probe core's visual.
4. Tests and icons.

## Acceptance criteria

- [ ] A pod with the docking chute ring and a small docking port on it, dropped at 5 km and 250 m/s, lands under 8 m/s with the port still attached (sim test).
- [ ] The stack chute's wall continues the pod's cone: its slope is within 10 % of the pod's cone slope near the collar (renderer test on the profiles).
- [ ] Shape, seam and part-id tests pass with the new part.
- [ ] `bun run lint`, `bun run typecheck`, `bun run test`, web vitest with `CI=true` and `bun run docs:check` pass (the two known script-thread failures aside).
- [ ] Icons before and after in the journal.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/278-pods-probes-and-parachutes.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
