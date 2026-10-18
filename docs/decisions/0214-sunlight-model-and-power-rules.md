# 0214 — Sunlight on parts, solar panel modes and the power rules in the sim

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/208-power-and-resources.md
**Builds on:** ADR 0203 point 3 (power rules), ADR 0171 (world tick and `background`), ADR 0119 (the Sun at the root), ADR 0109 (control needs a command source). Extends ADR 0171: a `background` hook can now integrate sunlight over its interval.

## Context

ADR 0203 asks for solar output that follows the sun angle, the distance to the sun and the shadow of bodies, in flight and in the background. It also asks for an EC cost when transmitting and an EC drain on probe cores. It does not say several things:
- how a module learns where the sun is;
- what "1 AU" means in a system scaled like Kerbin's;
- how a background interval that lasts a whole day sees the shadow of each orbit;
- how a panel that cannot track is mounted on a stack part.

## Decision

1. **`VesselApi.sunExposure(dt, factor)`.** It returns the mean of `factor(direction) × flux` over the last `dt` seconds.
   - `direction` is the unit vector to the star in the part frame. It is null in a system without a star, where `flux` is 1, as before.
   - In flight the sim takes one sample now.
   - On rails it takes samples at the middle of steps of at most 10 s along the rails path (at most 4 096 per interval). The orientation is the frozen orbital-rails orientation, or the body-fixed one on surface rails.
2. **Flux reference.** Flux 1 is the flux at the distance of the home planet's orbit (`a` of the home body, or of its ancestor that orbits the star). The rule is inverse square, so a panel's `rate` is its output at home. Our system is Kerbin-scaled, so the real AU would make every panel 120 times weaker.
3. **Shadow.** A body other than the star casts a cylinder of its radius along the line to the star; a part inside it gets flux 0. There is no penumbra and no terrain.
4. **Panel modes.**
   - `flat`: a plate facing `normal` in the part frame, output × cos of the angle to the star.
   - `track`: the panel turns about the part's +Y axis, output × the sine of the star's angle to that axis.
   - `deployable: false` makes a fixed panel: always on, with no toggle.
   - Stock panels: the folding 0.5 EC/s panel (flat, +Z), a fixed 0.35 EC/s panel, and a large tracking array at 8.25 EC/s (the ADR 0203 reference).
5. **RTG** at 0.75 EC/s, always on, in flight and in the background.
6. **Background refresh.** A rails vessel's `background` forms also run whenever their last run is 5 s of sim time old, besides the day tick, a wake and a save. Charge on rails then moves within seconds, and the solar sampling keeps the total the same.
7. **Power for control.** `ModuleDefinition.needs(config)` names the resource a module needs to power its part's control source. The stock probe core's `stock.probe-computer` draws 0.025 EC/s.
   - While the vessel holds none of that resource, the part is no control source.
   - A vessel whose every source part is unpowered is uncontrolled with the reason `no-power`. Control commands are refused with "no power", and `VesselSnapshot.uncontrolled` carries the reason.
   - `vessel:power-depleted` fires once on the change.
   - A crewed pod needs no power to be steered.
8. **Transmit cost.** Each bit a radio sends costs its vessel's strongest working antenna's `power` (W) × 0.2 EC per Mbit. A holder sends only what its charge pays for, so its queue pauses at zero EC.
9. **Power budget.** `ModuleDefinition.power(config)` describes a module's steady rate (positive produces, negative draws), whether it needs the sun, and its EC capacity. Core's `powerBudget` sums these by day and by night.

## Alternatives considered

- **A sun vector in `Ambient`** — rejected: a background hook needs the whole interval, not one instant, or a probe in a day-long tick would see one random sample of light or dark.
- **The real AU as the reference** — rejected: see point 2.
- **The same mean factor for every panel on rails** — rejected: the rails orientation is known (frozen), so flight and rails can agree within 1 %, which `solar.test.ts` checks over a day.

## Consequences

- API_VERSION patch bump (0.1.76): `VesselApi.sunExposure`, `ModuleDefinition.needs` and `power`, `VesselSnapshot.uncontrolled`, and the event `vessel:power-depleted`. They are additive for mods, which only call or declare them.
- Background cost: one shadow test per body for each sample, at up to 2 160 samples per vessel per stock day.
