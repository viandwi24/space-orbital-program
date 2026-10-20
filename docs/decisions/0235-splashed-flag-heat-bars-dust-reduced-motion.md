# 0235 — The snapshot says splashed; heat bars, touchdown dust and reduced motion in the flight view

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/246-visual-polish-dust-heat-splash.md
**Builds on:** ADR 0182 (buoyancy, the splashed situation), ADR 0204 point 6 (part temperature in the vessel panel), ADR 0026 (HUD frame data outside Svelte), plan 228 (term tooltips)

## Context

The release audit found five gaps in the flight view: a vessel that rests on water read "Landed on X" in the HUD although the sim already classes it `stock.splashed`; no temperature mark on a hot part in 3D; dust only from a firing engine; explosion and separation flashes that ignore `prefers-reduced-motion`; and Δv, SAS, RCS, MET and time warp read-outs with no tooltip.

## Decision

1. **`VesselSnapshot.splashed`.** The sim already knows (`situationView(...).splashed`: landed on water). The snapshot carries `splashed: true` while it holds, absent otherwise, so the HUD does not parse the situation id. `computeTelemetry` copies it and `situationLabel` returns "Splashed down on X" for a landed vessel with the flag. API 0.1.91 (additive).
2. **Heat bars.** `heatMarks(snapshot, vessel, project)` (pure) lists the parts `heatOf` shows (from 400 K or half the limit), hottest first by fraction of the limit, at most 6, projected through the renderer. The flight loop puts them in the per-frame data (`FrameData.heat`, not in the map view) and `HeatBars.svelte` moves a pool of six bars by DOM, as the target markers do. A bar turns to the danger tone from 90 % of the limit.
3. **Touchdown dust.** A new effects event `touchdown`, detected by `detectTransitions` when a vessel goes onto surface rails at 0.5 m/s or faster relative to the ground. It puffs a ring of `Dust` particles sized by the vessel's largest part and the speed, on the primary body only. The engines-off case that the audit named is the case this covers; biome colour is out of scope.
4. **Reduced motion.** `Renderer.setReducedMotion(on)` reaches `Effects`, which then draws no separation flash and no explosion glare; the fireball and smoke keep their shape. The flight reads `(prefers-reduced-motion: reduce)` once and on change. Engine ignition glow is left as is: it is a brightness ramp of the plume, not a strobe. No setting yet; the OS choice rules.
5. **Tooltips.** `Δv` (current stage and total), `MET`, the time-warp read-out, SAS and RCS carry their glossary entry (`Term`, or `data-tip-term` on buttons that already have a hint).

## Consequences

- Old saves and mods are untouched: `splashed` is optional and derived each snapshot.
- Heat bars add up to six projections a frame: negligible against the render.
- The glare switch has no unit test (`Effects` needs a GL context); the pure parts have.
