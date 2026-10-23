---
id: 300
title: "New pods: a 3-seat capsule with built-in chutes, a headlight descent module, a sphere capsule, a small cone capsule, lander cans and a crew cabin"
status: dropped
owner: ""
depends: [291, 278]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 300 — New pods

## Goal

The crewed parts the mission blueprints need:

| Part | Style | Details |
|---|---|---|
| 3-seat capsule, 2.5 m | Apollo command module | five windows, a docking collar, RCS ports set into the shell, built-in mains under a forward cover |
| Headlight descent module, 3 seats | Soyuz | |
| Sphere capsule, 1 seat | Vostok | |
| Small cone capsule, 1 seat | Mercury | |
| Lander cans, 1 and 2 seats | | |
| Crew cabin | | |

Each capsule re-enters base first and lands under its chutes.

## Context

- Split from plan 278 (2026-10-21).
- ADRs 0260 (built-in chutes), 0246 (low mass, blunt base), 0257 (kit), 0255 (names).
- `refs/reverse-engineering-ksp-ksp2/09-parts-catalogue.md` §1.1 for crew, mass and heat ranges.

## Scope

**In:** generators and parts, built-in `ModuleParachute` on the 3-seat capsule, RCS ports in the pod shell (the nozzles in the pod's `ModuleRcs`), tech nodes, OrbitX titles.
**Out:** the lander cabin (296), the cupola (297).

## Design notes

Each capsule's centre of mass and blunt base follow ADR 0246.

## Steps

1. Generators and parts, one capsule at a time.
2. Re-entry and landing test per capsule.

## Acceptance criteria

- [ ] Each new capsule re-enters base first and lands under its chutes at under 8 m/s (sim test per capsule).
- [ ] `bun run lint`, `bun run typecheck`, `bun run test`, web vitest with `CI=true` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/300-new-pods.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.

## Log

- 2026-10-24 — Parts delivered by plan 303 (and 356/361/309/330); remaining flight tests moved to plan 388. Dropped with the owner's approval.
- 2026-10-21 — Parts delivered in plan 303: 3-seat capsule with built-in chutes, descent and orbital modules, sphere and cone capsules, lander can, crew cabin. Open: per-capsule re-entry tests.
- 2026-10-21 — Split from plan 278, so the parachutes the owner asked about come first.
