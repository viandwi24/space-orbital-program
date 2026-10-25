---
id: 414
title: "The pad at 120 Hz on the M5: vegetation and site drawn the AAA way"
status: in-progress
owner: "Worker B"
depends: [413]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 414 — The pad at 120 Hz

## Goal

Pad mean frame at most 8.3 ms and frames over 8.4 ms at most 5 % on the M5 at High; a locked 60 on the M2 and Windows tiers at their defaults (`[manual]`). The look near the vessel stays.

## Context

- Measured headed (refs/graphics-v2/07-look-costs.md, "Correction"): orbit 8.3 ms with every look on; the pad 18 to 20 ms; without the launch site 11.9; the site's parts add up to about 3 of its 6 to 7 ms (floodlights 1.5, vegetation 0.8, people 0.4, structures 0.2).
- The earlier tables were headless, paced at 60 Hz.

## Steps

1. Vegetation levels of detail (done, ADR 0372): trees, bushes, tufts.
2. Find the unaccounted 3.5 ms of the site and the 3.6 ms the pad costs over the orbit without it (the vessel, the ground, the planet pass near the ground).
3. The four floodlights: idle by day, 1.5 ms (a light costs every lit fragment even at intensity 0); warm both variants at load and switch at dusk, or merge them.

## Acceptance criteria

- [x] `bun test packages/renderer`, `typecheck`, `lint`, `docs:check`.
- [x] The vegetation's levels of detail and `thinTufts`; `setLookOff` for floods, structures, people and steam.
- [ ] Pad mean at most 8.3 ms, frames over 8.4 ms at most 5 %: not met (16.8 ms after the lights, from 19.7).
- [x] The scene's lights 11 to 4, the floodlights as glow, no pipeline at dusk (ADR 0373).
- [ ] `perf:gate`.
- [ ] [manual] a locked 60 on the M2 and Windows.

## Docs checklist

- [x] `docs/STATUS.md`, `docs/journal/414-pad-at-120hz.md`, ADR 0372.

## Log

- 2026-10-24 — Step 1 by Worker B (ADR 0372). The measurement showed the vegetation is under 1 ms of the pad's frame; the rest is in steps 2 and 3.
- 2026-10-25 — Lights by Worker B (ADR 0373): the pad's mean frame 19.7 to 16.8 ms, dusk builds 0 pipelines. Stays in progress for the owner's look at night and plan 415.
- 2026-10-25 — Light sets per material by Worker B (ADR 0374): the pad's mean frame 21.2 to 19.5 ms in an interleaved A/B; dusk builds 0 pipelines.
- 2026-10-25 — Paused: the worker sessions stopped (Claude Code access disabled for the organization). The remaining work and the measuring rules are in `docs/roadmap/handover-2026-10-25.md`.
