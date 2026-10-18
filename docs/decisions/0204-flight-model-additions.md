# 0204 — Flight model additions

**Status:** accepted
**Date:** 2026-10-18
**Plan:** plans/212-flight-model-additions.md
**Builds on:** ADR 0023 (re-entry heating and part temperature), ADR 0094 (rules per world)

## Context

The atmosphere is isothermal exponential at 288.15 K, `p = p0·exp(-h/H)` cut at `atmo.height` (`atmosphere.ts:11-15`, `constants.ts:21-23`). There is no speed of sound, so no Mach or transonic effects (research doc 15a §1). Every part fails at a 1000 K default `maxTemperature` (`thermal.ts:153-160`). KSP's most used accessibility option is the re-entry heating percentage. KSP uses about 2000 K for most parts, 2400 K for pods and 3300 K for heat shields. Rancangan §5.1, §5.3 and §5.5b.

## Decision

1. **Per-body atmosphere temperature curves.** A body's atmosphere carries a temperature curve over altitude (keyed points, linear between). Density uses `ρ = p/(R·T(h))`. Bodies without a curve keep 288.15 K. Stock and Sol bodies get curves.
2. **Speed of sound** `a = √(γ·R·T(h))` per body gas (γ and R in the atmosphere data; air defaults 1.4 and 287).
3. **Transonic drag rise.** Part drag is multiplied by a Mach factor curve: 1.0 below Mach 0.8, a peak of about 2.5 near Mach 1.05, easing to about 1.6 by Mach 2 and flat beyond. The curve is data; the values are starting points for balancing.
4. **Re-entry heating % world rule:** 0–120 %, default 100 %, scales the convective heating term. Sandbox also gets "crash damage" and "unbreakable joints" rules.
5. **Per-part max temperatures:** default about 2000 K, pods about 2400 K, heat shields about 3300 K, set in part data.
6. **Temperature data for bars:** the snapshot carries each part's temperature over its limit when above 50 %; the HUD draws a bar next to hot parts and in the inspector.

## Alternatives considered

- **A full standard-atmosphere model per body** — rejected: a temperature curve plus the ideal gas law gives what drag, heating and Mach need.
- **Mach effects only on wings** — rejected: rockets feel the transonic drag rise most.

## Consequences

- Plan 212 delivers it. Plan 230 shows the heating % in Create World.
- Ascent Δv to orbit rises; stock designs and the first-flight guide need a check.
- The snapshot grows by one optional field per hot part.
