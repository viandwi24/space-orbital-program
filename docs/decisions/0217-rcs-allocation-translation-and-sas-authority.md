# 0217 — RCS: per-nozzle allocation, translation in the attitude command, and SAS authority

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/211-rcs-and-monopropellant.md
**Builds on:** ADR 0203 point 8 (RCS), ADR 0049 (SAS uses module authority), ADR 0045 (the mixer), ADR 0206 (key profile)

## Context

ADR 0203 asks for a 4-way monopropellant block and a small cold-gas thruster that rotate and translate the vessel, with R to toggle them. It leaves open where the on/off state lives, how translation reaches a module, how the nozzles share a demand, and how SAS counts RCS.

## Decision

1. **Vessel RCS switch** in the sim: `set-rcs { vessel, on }`, saved on the vessel (`rcs`), shown as `VesselSnapshot.rcs`.
   - It is not an action group: a module action cannot set a vessel flag. The R key and the HUD pill send `set-rcs`.
   - The `stock.rcs` group of ADR 0203 is not defined.
2. **Translation** rides on the `attitude` command: `translate { x, y, z }`, each −1..1, in vessel axes (x right, y forward along the nose, z up). It is kept until a later command changes it.
   - Modules read it as `VesselApi.translateDemand` in the part frame, turned like `torqueDemand`.
   - `VesselApi.rcs` says whether RCS is on.
3. **Allocation** (`stock.rcs`): each nozzle fires `clamp(dir · translation + mix(rotation, lever × dir), 0, 1) × limiter`, using the mixer of ADR 0045.
   - The part's `rotate` and `translate` switches drop one share.
   - There is no optimiser, so the result is deterministic and the same per nozzle.
4. **Propellant**: `thrust × fraction / (Isp × g0)` per nozzle. The Isp is linear between vacuum and sea level by the ambient pressure, like an engine's. Short of propellant, every nozzle fires less, and the module reports `dry`.
5. **SAS authority** while RCS is on and rotation is allowed is the sum of `|lever × dir| × thrust / 2` over the nozzles: a nozzle pushes one way only. Wheels and gimbals still count, so RCS adds to them.
6. **Fine control** (Caps Lock) scales the pilot's keys by 0.25, not SAS.
7. **Effects**: `PartVisual.puffs` names the module field (`firing`, 0..1 per nozzle) and the nozzles. The renderer draws a short jet per firing nozzle. The audio hiss follows the mean firing.
8. **Numbers** (KSP reference, starting points):
   - the block: 4 × 1 kN, Isp 240/100;
   - the cold-gas port: 200 N, Isp 70/40, carrying its own 8 kg;
   - the inline tank: 120 u;
   - the radial tank: 30 u;
   - the pod: a 10 u reserve, empty at build so the reference rockets keep their mass.

## Consequences

- API_VERSION 0.1.77 (additive): `VesselApi.rcs` and `translateDemand`, `PartVisual.puffs`, `set-rcs`, `attitude.translate`.
- The navball does not draw its own RCS mark: the RCS pill sits beside SAS in the same pod and reads "RCS on", "RCS off" or "RCS: no propellant".
