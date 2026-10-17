# 0079 — Plasma blackout is a display of the heating flux; there is still no communications system

**Status:** accepted (the "no communications system" part is amended by [0101](0101-communications-one-model-six-tiers-delay-off-by-default.md): with comms tier 1 the blackout drops the link; the display stands)
**Date:** 2026-10-17
**Plan:** plans/040-effects-and-assets-3.md

## Context

Draft 040 held a "comms blackout hook" until a communications system exists. The game has none: no antennas, signal range, delay or loss of control. A blackout that loses nothing cannot be a gameplay rule, but the display of one is still worth having, and a hook that waits for a system that is not planned helps nobody.

Physics (sources in `research/effects-3.md`): radio fails when the plasma frequency of the shock layer reaches the link frequency, which needs a critical electron density that depends on the link frequency (the RAM-C reflectometers' cutoff densities in one simulation study were 1.52e19, 1.25e18, 1.37e17 and 1.54e16 m^-3 for four frequencies). Electron density depends on body shape, speed and altitude; communication returns lower down because the vehicle slows and collisions with the denser air damp the electrons.

## Decision

1. **`blackoutLevel(airspeed, altitude, atmosphere)`** (renderer, `effects/reentry.ts`, pure): 0 to 1 by a smoothstep of the stagnation flux of the heating model (ADR 0023, Sutton-Graves), from `BLACKOUT_FLUX_START` 1.5e5 to `BLACKOUT_FLUX_FULL` 4e5 W/m^2. Ionisation and heating both come from the dissociation behind the same shock, so the flux is the proxy; the window in altitude and speed follows from the law (no density up high, no speed down low) and ends when the vessel slows, as the real one does. The thresholds are set against the home body's returns (peak flux 1.2e5 to 5.5e5, ADR 0078): a light, shallow return slips through, a dense, steep one blacks out, and the signal goes after the shell has started to glow.
2. **The HUD shows it**: `BlackoutBadge` ("SIGNAL LOST, plasma blackout", with drifting scan lines; steady for reduced motion) at 0.5 and above, fed by `HudModel.blackout` (`vesselBlackout` in `apps/web/src/lib/blackout.ts` from the vessel's air-relative speed).
3. **Nothing else changes.** Controls, scripts, telemetry and the sim are untouched. A communications system (antennas, range, delay, control loss) is draft plan 070; it will read the same level.

## Alternatives considered

- **A sim module event now** (a `vessel:comms` event with a level): the sim would carry a number nothing consumes.
- **Blank or freeze the instruments**: punishes the player for something that has no rule behind it.
- **Electron density from a chemistry model** (Park, Saha): the game has no stagnation temperature, only the flux; an invented model would add precision it cannot back.

## Consequences

- The badge can show in an ordinary return without anything failing; the text says "blackout", not "control lost", for that reason.
- A mod or script cannot read the level yet.
