---
id: 212
title: Mach effects, atmosphere temperature curves, heating rule, part temperature limits
status: draft
owner: ""
depends: []
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 212 — Mach effects, atmosphere temperature curves, heating rule, part temperature limits

## Goal

The atmosphere has a temperature that changes with altitude on each body, so density and the speed of sound are right. Drag rises through the transonic band. A world rule "Re-entry heating %" scales convective heating. Parts have type-based temperature limits like KSP (about 2000 K for most parts, 2400 K for pods, 3300 K for heat shields), and the snapshot carries what the HUD needs for temperature bars.

## Context

- Rancangan §5.1 (Mach and per-body temperature curves), §5.3 (heating % rule), §5.5b (part temperature limits and bars).
- ADRs: 0204 (flight model additions), 0023 (re-entry heating and part temperature), 0094 and 0111 (rules as registry entries).
- Research:
  - 15a §1: the atmosphere is isothermal at 288.15 K, `p = p0·exp(-h/H)` (`packages/sim/src/atmosphere.ts:11-15`, `packages/sim/src/constants.ts:21-23`); home body H = 5600 m, 70 km top (`mods/stock/src/bodies.ts:47`). No speed of sound anywhere; Mach was scoped out in `docs/plans/041-aero-and-structure-extras.md:31`.
  - 15a §1: part drag `F = -½ρ·Cd·A·|v|·v` (`packages/sim/src/aero.ts:1-10`, `packages/sim/src/frames.ts:546-553`).
  - 15a §2: Sutton-Graves heating (`packages/sim/src/thermal.ts:64-85`); a part above `maxTemperature` (default 1000 K, `constants.ts:65`) fails (`thermal.ts:153-160`, `packages/sim/src/vessel.ts:634-648`).
  - 15 §5.2: no flight-difficulty rules exist; rules live in `mods/stock/src/rules.ts`.
  - 07 (KSP physics) for the reference curves.

## Scope

**In:**
- `atmosphere.temperatureCurve` on the body schema: altitude → K, linear keys. Absent means today's 288.15 K, so mods keep working.
- Density from the local temperature; speed of sound `a = √(γ·R·T)`; Mach in the ambient and the snapshot.
- Transonic drag multiplier on `Cd` as a function of Mach (peak about ×2.5 near Mach 1.1, settling to about ×1.4 above Mach 3).
- Temperature curves for the stock home body and the Sol bodies with atmospheres.
- Rule `stock.reentry-heating` (number, 0–1.5, default 1; Sandbox may set 0) applied to the convective term.
- Per-part `maxTemperature` in stock parts by role: 2000 K default, 2400 K pods, 3300 K heat shield. Default for undeclared parts rises to 2000 K.
- Snapshot: `PartSnapshot.temperature` plus `maxTemperature`, and the vessel's hottest part as a fraction, for bars (plans 214 and 218 draw them).

**Out:**
- Body lift, conduction, internal temperature, heating on rails (P1, rancangan §5.6).
- Crash damage and unbreakable joints switches (cheats in plan 203).
- The temperature bar UI itself (plan 214 inspector, flight overlay).

## Touches

- **Size:** M
- **Edits:**
  - `packages/core/src/schemas.ts` (body `atmosphere.temperatureCurve`, optional)
  - `packages/sim/src/atmosphere.ts`, `packages/sim/src/constants.ts`, `packages/sim/src/aero.ts`, `packages/sim/src/frames.ts`, `packages/sim/src/thermal.ts`
  - `mods/stock/src/bodies.ts`, `mods/sol/src/bodies.ts` (curves)
  - `mods/stock/src/parts.ts` (`maxTemperature` per part)
  - `mods/stock/src/rules.ts` (heating rule in presets)
  - `packages/core/src/definitions.ts` (`Ambient` gains `temperature` and `speedOfSound`)
  - `packages/core/src/protocol.ts` (snapshot `mach`, `PartSnapshot.maxTemperature`)
  - `apps/web/src/lib/worlds/CreateWorld.svelte` only if 230 has not landed; otherwise 230 shows the rule
- **Shared contracts:** body schema (additive), `Ambient` and `PartSnapshot` (additive), rule id `stock.reentry-heating`. No save version bump: parts read limits from definitions.

## Design notes

- Keep the exponential pressure model. Only density uses the curve: `ρ = p / (R·T(h))`. This keeps old orbits and pad pressures the same.
- Mach drag is a single curve in `constants.ts`, not per part, in line with KSP's global drag curve. Nose cones keep their lower `Cd`.
- Heating rule multiplies only the convective input. Radiative cooling is unchanged, so a rule of 0 means parts cool and never heat.
- The higher default limit makes today's craft safer on re-entry. Heating tests in `packages/sim/test/heating.test.ts` must be re-read and their expectations updated with a journal note.

## Steps

1. Schema and atmosphere: temperature curve, density and speed of sound. Tests.
2. Transonic drag multiplier in the drag pass.
3. Curves for stock and Sol bodies, from research doc 07 and public standard-atmosphere tables.
4. Heating rule and per-part limits; update heating tests.
5. Snapshot fields for Mach and temperature bars.
6. Re-run the release ascent tests (`booster-ascent`, `asparagus-ascent`, `moon-mission`) and rebalance if Δv to orbit moves more than 10 %.

## Acceptance criteria

- [ ] `bun test packages/sim/test/atmosphere-temperature.test.ts` passes: with no curve, density equals today's to 1e-9; with the stock curve, the speed of sound at 0 m is 340 ± 2 m/s and at 11 km is 295 ± 3 m/s.
- [ ] `bun test packages/sim/test/mach-drag.test.ts` passes: the drag factor at Mach 1.1 is greater than at Mach 0.6 and at Mach 3.
- [ ] `bun test packages/sim/test/heating.test.ts` passes with a new case: the same re-entry with `stock.reentry-heating = 0` keeps every part under 400 K; at 1 the pod peaks below 2400 K with a heat shield.
- [ ] `bun test packages/sim/test/booster-ascent.test.ts packages/sim/test/asparagus-ascent.test.ts packages/sim/test/moon-mission.test.ts` pass.
- [ ] Chromium e2e `e2e/reentry.e2e.ts`: `window.__orbitalDebug.setLocation` puts a pod at 60 km, 2300 m/s downward; the vessel panel shows a temperature bar for the shield with a text value; the flight ends with the pod intact.
- [ ] `bun run check:affected` passes.
- [ ] CI is green on the plan's ready tag (full suite, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/212-flight-model-additions.md` written, with the curves' sources and any rebalance.
- [ ] `docs/architecture/simulation.md` updated (atmosphere, Mach drag, heating rule, limits).
- [ ] `docs/architecture/plugin-system.md` updated (body `temperatureCurve` for mods).
- [ ] `docs/research/stack-versions.md` updated for any reference table looked up.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
