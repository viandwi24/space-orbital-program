---
id: 246
title: "Visuals: touchdown dust, heat bars on hot parts, the Splashed situation, reduced motion for flashes, term tooltips on every HUD read-out"
status: draft
owner: "Worker E"
depends: []
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 246 — Visuals: touchdown dust, heat bars on hot parts, the Splashed situation, reduced motion for flashes, term tooltips on every HUD read-out

**Size:** M

## Goal

Close the visual gaps the audit found.

## Context

- The release audit of 2026-10-20 (main @ 4281d931, read-only) found these items Partial or Missing against `refs/rancangan-terpadu.md`. The owner ordered plans for every missing feature at once ("Buatkan plan untuk semua fitur yang kurang sekarang", 2026-10-20). They do **not** block `v1.0.0` (plan 232); they form the v1.1 wave. File and line cites are from the audit; check them against current main when refining. Design: §5.5b, §7.6d, §11.3, §11.7, §11.8.
- §11.3: ground dust comes only from a firing engine on an airless body (`packages/renderer/src/effects/system.ts:179-185,415,460-526`); no touchdown dust with engines off; no plan covered it.
- §5.5b: no temperature bar near hot parts in 3D.
- §7.6d / C13: no "Splashed" situation; `situationLabel` has no water case (`hud-model.ts:51-54`).
- §11.8: the explosion flash (`effects/explosion.ts:17,33`) and engine ignition flash (`effects/plume-mesh.ts:184-193`) ignore reduced motion.
- §11.7: only 7 term tooltips are wired (Ap, Pe, Period, Inclination, Eccentricity, ALT, TWR); Δv, Isp, MET, SOI, Q, Mach, EC, SAS, RCS and the navball markers have glossary entries but no tooltip.

## Scope

**In:**

- Touchdown dust: a short puff on ground contact above a speed threshold, on any body with a surface; cheap particles.
- Heat bars: a small bar above a part when it passes 50 % of its limit (screen-space, few at a time).
- "Splashed down on X" situation for water contact.
- Reduced motion damps both flashes.
- Term tooltips for every glossary entry shown on the HUD.

**Out:**

- Biome-coloured dust.

## Touches

`packages/renderer/src/effects/*`, `apps/web/src/lib/hud-model.ts`, `apps/web/src/lib/hud/*`, `apps/web/src/lib/ui/Term.svelte`.

## Steps

1. Each item with a unit test (situation label, reduced-motion flag, heat-bar threshold).
2. Chromium e2e: land with engines off and see the dust effect active; the HUD term tooltips appear on hover.
3. Light checks locally, push `ready/246` for CI, and follow the worker brief (batch mode while it is in force).

## Acceptance criteria

- [ ] Touchdown dust, heat bars and Splashed exist; tests pass.
- [ ] Reduced motion damps the flashes.
- [ ] Every HUD read-out with a glossary entry has a tooltip.
- [ ] CI is green on `ready/246`, and the e2e of this plan passes on Chromium.

## Docs checklist

- [ ] STATUS row, journal `docs/journal/246-visual-polish-dust-heat-splash.md`, remove the matching Known-issues lines, any ADR written while refining.

## Log

- 2026-10-20 — Created by the coordinator from the release audit (owner order). Draft: the owner (Worker E) refines it against current main before claiming.
