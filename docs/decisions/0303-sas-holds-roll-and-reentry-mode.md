# 0303 — SAS pointing modes hold roll in the air; a Re-entry mode

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/361-shuttle-landing-and-reentry.md
**Amends:** ADR 0049 (stability assist), ADR 0161 point 5 (level wings), ADR 0271 (SAS modes)

## Context

The owner flew the Wayfarer orbiter on SAS prograde and it drifted into a bank, its nose yawed off the path (`refs/owner-shots/shuttle-prograde-tilt-2026-10-22.jpg`). Pointing modes aimed the nose and only damped the roll rate, so nothing brought a disturbed roll back.

Re-entry was unstable too. The orbiter flies stably only nose first: its wings sit far aft. SAS Hold keeps an inertial attitude, so the angle of attack grows as the path curves round the planet, until the orbiter flies backwards. No mode held an attitude against the airflow.

## Decision

1. **Every pointing mode keeps a roll in the air.**
   - The control part's top (+Z) is kept at the angle from local up, about the nose, that it had when the mode took over (`SasState.roll`, rad).
   - It is cleared by a mode change and while the player steers, so the roll they leave is the one kept, as in KSP.
   - In space the roll is only damped, as before. A held roll there kept a vessel on prograde working too long to settle and go on rails; nothing disturbs roll in vacuum but the player.
   - With the nose near the vertical, up has no direction across it and the roll is left free.
2. **Wings level in the air.** Prograde and retrograde in the atmosphere roll the control part's top toward local up, while the nose is more than about 30° off the vertical. A rocket climbing straight up keeps its roll.
3. **A Re-entry mode** (`reentry`, assist level 1):
   - the nose is held `REENTRY_AOA` (40°) above the surface-relative airflow, in the vertical plane;
   - the wings stay level from orbit down;
   - a HUD button and the key action `sasReentry` (Alt+R).

## Consequences

- The orbiter on SAS prograde flies straight: the bank goes from 20° to 0.3° within 15 s, with 0.01° of sideslip.
- On SAS Re-entry it comes down from 75 km within 5° of 40°, wings level within 0.1°, peaking at 937 K on the wings.
- Autopilots that use `direction` now keep their roll too, instead of letting it drift.
