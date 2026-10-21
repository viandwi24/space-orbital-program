---
id: 278
title: "Pods, probes and parachutes: 3-seat, headlight, sphere and small capsules, lander cabins, probe cores, chutes that continue the pod, docking chute ring"
status: draft
owner: ""
depends: [291, 277]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 278 — Pods, probes and parachutes: 3-seat, headlight, sphere and small capsules, lander cabins, probe cores, chutes that continue the pod, docking chute ring

## Goal

The pod family covers the real-rocket blueprints (3-seat Apollo-like, Soyuz-like headlight descent module, Vostok-like sphere, Mercury-like small cone, lander cans, crew cabin; the LM-like cabin is plan 296 and the cupola plan 297), probes look like probes (octagon, sphere with whips; the satellite bus is plan 298), and parachutes follow ADR 0260: nose chute continuing the pod slope, docking chute ring with a top node, curved radial packs, built-in chutes on the 3-seat pod.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0260, 0257
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** New and remodelled pod and probe generators with windows, hatches, ladders and built-in RCS ports; parachute generator with `taper`; docking chute ring part and multi-anchor canopies; radial chute remodel; OrbitX titles.
**Out:** Cockpits and spaceplane parts (shuttle: plan 295); the lander cabin (296), the cupola (297), the satellite bus (298).

## Design notes

Crew capacity, masses and heat tolerances from the KSP ranges in `refs/reverse-engineering-ksp-ksp2/09-parts-catalogue.md` §1.1 scaled to our pods; the low-mass and blunt-base rule of ADR 0246 applies to every capsule.

## Steps

1. Pod generators and parts.
2. Probe generators and parts.
3. Parachute rework and the docking chute ring (sim: port stays attached while the ring deploys).
4. Re-entry test for each capsule with its heat shield.

## Acceptance criteria

- [ ] Each new capsule re-enters base first and lands under its chutes at under 8 m/s (headless test per capsule).
- [ ] A pod with the docking chute ring and a docking port docks, undocks and then lands under the ring's canopies (sim test).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/278-pods-probes-and-parachutes.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
