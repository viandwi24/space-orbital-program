# 063 — Aeroplane gameplay

**Plan:** [plans/063-aeroplane-gameplay.md](../plans/063-aeroplane-gameplay.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0161](../decisions/0161-aeroplanes-wheels-level-runway-trim-flaps-readouts.md) (new), [0019](../decisions/0019-ground-tile-and-impact-damage.md), [0075](../decisions/0075-wing-lift-and-drag-polar.md), [0049](../decisions/0049-sas-in-the-sim-with-module-authority.md) · **Research:** none

**Status when written: criteria met here; the trimmed-cruise criterion was restated as an attitude hold (see below).**

## What was done

| Where | What |
|---|---|
| `packages/core`, `packages/physics` | `ShapePlacement.friction` (Rapier: the minimum combine rule), `ModuleCollider.wheel` / `WheelSpec`, `VesselDesign.aircraft`, the `trim` command, SAS mode `level`; API_VERSION 0.1.65 |
| `packages/sim` | tyre forces from the ground contacts (`stepWheels`), the level start for aircraft, trim in `effectiveControl`, `level` in `stepSas` |
| `mods/stock` | `ModuleWheel`, `stock.wheel` and `stock.wheel-steer` (Aerodynamics node), flaps on the wing, the `stock.brakes` and `stock.flaps` groups |
| `packages/renderer` | a `gear` generator (strut and tyre) |
| web | `lib/aircraft/aero-readout.ts` and `AeroStrip` (angle of attack, IAS, glide ratio, stall), keys `]` `[` (trim), `C` (brakes), `;` (level wings), the `level` SAS button, the Hangar's Aircraft switch, the Launch screen pairing aircraft with runways |
| tests | sim `aeroplane.test.ts` (6), web `aircraft/aero-readout.test.ts` (3), `launch-model.test.ts` (+1), `editor/state.test.ts` (+1), stock and keybinding tests updated |

## Measured

- **Coast-down** from 6 m/s: the rolling resistance's 0.02 g within 15 %; the track stays along the nose (north component over speed above 0.99); with brakes it slows far sooner.
- **Take-off** of the 11.5 t test plane (four wings at 0.15 rad, a tailplane at 0.04, rocket at 60 % throttle): lift-off 150.5 to 152.5 m/s after about 1 250 m and 16 s at -0.4 degrees, against 138 to 146 m/s by hand from the wing polar (8.7 and 4.5 %, within 10 %); the run matches `v² / 2a` within 20 %.
- **Touchdown**: 2 m/s on the wheels breaks nothing; 8 m/s breaks a wheel (tolerance 6).
- **Level wings** from a 20 degree bank and 8 degrees nose down: bank within 0.6 and nose within 2.8 degrees of the horizon over 45 to 60 s. Trim +0.3 against -0.3 changes the nose by 2 degrees in 2 s without the assist.

## What surprised me

- **The plane on its tail, then rearing.** The first test planes had no tailplane or one set the wrong way; a plane needs its wings near the centre of mass and a tail behind it. Four wings, a tail at +0.04 and wide-set gear made a craft that rolls straight, lifts off level and flies.
- **Shimmy.** A tyre that cancels its whole side slip in one step overshoots: the contact is a metre below the centre of mass. A quarter per step settles (ADR 0161, found while building).
- **The frame re-anchor.** After a kilometre's roll the flight frame re-centres; contacts kept in frame coordinates put the tyre forces 950 m away, and the craft went wild at 134 m/s. Contacts are kept in the body's axes now.
- **Narrow gear catches a wingtip.** Main wheels 1.1 m apart under a 7 m span let a wingtip strike at speed; the test plane's gear is spread wide.
- **The cruise criterion was wrong.** A level-wings assist holds attitude, not altitude: altitude depends on the speed matching the lift. The test checks what the mode does (wings level, nose on the horizon) and trim separately.
- **Keys**: B, G, R and F are the free keys the keybinding tests use as examples, and `-` is reserved (zoom), so the aircraft keys are `]` `[` `C` `;`.
- The 1 200 m runway of level one is just long enough for the rocket-powered test plane; real aircraft engines (thrust that depends on air) stay out of this plan.
