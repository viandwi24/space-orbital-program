# 0365 — The ascent holds max-Q, and the pilot knows the air

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/385-wayfarer-at-sol-scale.md
**Builds on:** ADR 0277 (the pilot's facts), ADR 0317 (the system sets the difficulty)

## Context

On Sol rescaled the Wayfarer Shuttle lost its attitude 40 to 50 s after liftoff, still on its boosters: the pitch program is a function of altitude only, and a stack with a thrust-to-weight of 1.5 or more reached 880 m/s at 9 km, a dynamic pressure of about 160 kPa. At that pressure the angle of attack went from 13° to over 90° in 12 s, whatever the autopilot commanded. A real launcher throttles down through max-Q (about 35 kPa).

## Decision

1. **`PilotBody.air`**: `{ surfaceDensity, scaleHeight }` of the body's atmosphere (kg/m³ at the radius, m), optional (absent without air or from an older host), filled by the sim's pilot facts from the body's own air model. Not part of the mod API surface beyond the pilot facts an autopilot reads.
2. **A max-Q throttle in the Ascent autopilot.** The dynamic pressure is `½ ρ(h) v²` with the speed relative to the rotating air. Below 40 kPa the ascent's throttle is the 3 g limit as before; from 40 kPa it falls linearly to a floor of 0.35 at 60 kPa. It applies in the ascent and the insertion while in the air, and does nothing without `air`.
3. **Stock's Shuttle gets Sol designs.** The blueprint's Sol systems carry more propellant under the tank (two 5 m tanks on Sol rescaled, three and a second booster pair on Sol 1:1, on a 5 m engine plate); `EXPECTED` in `blueprint-systems.test.ts` is `goal` in all three systems.

## Consequences

- Every Guidance ascent in an atmosphere now slows through max-Q. The stock blueprints still reach orbit in the systems they are for (the flights in `blueprint-systems.test.ts`).
- A mod's autopilot reads the same `air` and can use `dynamicPressure` from `mods/guidance`.
- The 40 and 60 kPa lines are starting numbers; a body with thick air and a fast stack is the first place they will want tuning.
