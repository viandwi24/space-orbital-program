# 0023 — Re-entry heating and part temperature

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/014-reentry-heating.md

## Context

Plans 007 and 012 simulate no heat. A vessel can drop through the atmosphere at 2 km/s unharmed, and ADR 0019 left "re-entry survival hooks" (`impactTolerance`, `part:damaged`) for this plan. ADR 0021 removes debris on rails at the atmosphere top because rails have no drag. Open questions in the draft: where the temperature lives, how a heat shield and its ablator go through the SDK, and what `part:damaged` says when the cause is heat. Formulas and limits are in `research/reentry-heating.md`.

## Decision

**Temperature is part state in the sim**, not module state: `PartState.temperature` (K, plain data in the world component `sim.part`, starts at `AMBIENT_TEMPERATURE` 288.15 K). Every part has one, whatever modules it carries. It is exposed additively as `PartSnapshot.temperature?` so the renderer and HUD can read it.

**Heating.** Each flight step, for each part in an airflow: `q = k·√(ρ/r_n)·v³` (Sutton-Graves, `k = 1.74e-4`, `r_n` = cylinder radius or half the narrower box side, `v` the part's speed relative to the co-rotating air, `ρ` the local density), times the area the flow hits: the part's per-axis projected areas from the drag model (`axisAreas`, so an end face attached to another part is shielded) weighted by `|v_axis|/|v|`. Tail-first, only the exposed end of the stack heats; the others see only the small sideways component of any angle of attack. Conduction between parts is not modelled.

**Cooling and capacity.** Only the skin is heated: capacity `SKIN_HEAT_CAPACITY · surface area`, 7 290 J/(m²·K) (3 mm aluminium). Radiation `ε·σ·A·(T⁴ − T_env⁴)` with ε 0.8, `T_env` = 288.15 K (also in vacuum). Air convection cooling is ignored. The update is implicit Euler solved by Newton from an upper bound, so the same function is stable for a 20 ms flight step and a 10 s rails chunk: parts also cool on rails (the vessel keeps its heat through a warp only as far as radiation allows).

**Limit and loss.** `PartDefinition.maxTemperature` (K, optional, default 1000). A part above it after a step is **destroyed**: cut from every neighbour (`splitVessel`, as damage does), removed, `part:damaged` emitted; an emptied vessel is destroyed (reason `<part> destroyed by overheating`). No `broken` outcome for heat: a burnt part does not fly on as debris. Applied after the physics step with the impact damage, ascending part order, so it is deterministic. Stock limits: tanks 900 K (aluminium melts at 933 K), pod, wheel, decoupler, legs 1000 K, engine 1800 K, heat shield 3000 K.

**`part:damaged` gets `cause?: 'impact' | 'overheat'` and `temperature?: number`** (additive; absent `cause` means impact). For `overheat`, `speed` is the airspeed, `outcome` is always `destroyed`. The sim sets `cause` on every emit.

**Heat shield through the SDK.** New optional module hook `ModuleDefinition.absorbHeat(ctx, { power, temperature }, dt) => watts`: called in the thermal step for a part with airflow power, before the skin is warmed; the returned power (clamped to `0..power`) is carried away, the module may change its state. The ablator is an ordinary resource, `stock.ablator` (1 kg per u, `flowMode: 'none'`), held by the shield module, which declares a `store` (so the sim counts its mass and it weighs on the vessel until burnt). `stock.heat-shield` (module `stock.heat-shield`, part `stock.heat-shield`, 80 kg + 120 kg ablator, 0.2 m, `crossfeed: false`): above 700 K it absorbs the whole airflow power by burning `power·dt / 3e6 J/kg` of ablator, until the ablator is gone. A shield protects its own skin; the part above it is protected by the shielded end face (no heating) and by not being exposed. API 0.1.3 -> 0.1.4 (additive: `maxTemperature`, `absorbHeat`, `HeatLoad`, `PartSnapshot.temperature`, event fields).

**Debris: `reapDebris` stays.** Heating does not replace the removal at the atmosphere top (ADR 0021): rails debris is not integrated through the atmosphere, so there is nothing to heat; the cut at the top already stands for "burnt up". Debris in flight below the atmosphere top (descending, not put on rails) now heats and burns for real, or hits the ground as before.

## Alternatives considered

- **Temperature as module state** — only parts with a thermal module would have it; every part needs it, and the snapshot would need a convention.
- **Heat the whole part mass** — with the Sutton-Graves flux at this planet's 2.2 km/s the entry is far too mild (a 900 kg pod gains degrees, not hundreds). A thin skin is also the physical picture.
- **Broken outcome at the limit, destroyed at some factor** — heat has no "flies on" meaning; one outcome is simpler to explain.
- **Shield as a flag with a fixed absorb rate** — a module hook keeps the SDK generic (any mod can build reactive cooling, radiators, heat sinks) and keeps the ablator a real resource with mass.
- **`ρ·v³` without `√(1/r_n)`** — the plan's wording; Sutton-Graves is the same law with the nose radius dependency that makes a blunt capsule cooler than a needle.
- **Heating on rails** — would need drag on rails (ADR 0021).

## Consequences

- Re-entry matters: an unshielded stack tail-first from a deorbit path loses its windward end; the plan 012 lander is unaffected because its retro burn keeps it slow (peak 295 K).
- Heating numbers are tuned by `k`, `SKIN_HEAT_CAPACITY` and the stock limits; the exposure model (windward area only, no conduction, no wake, no angle-of-attack shock) is a first cut. Uncontrolled vessels tumble and will heat sideways.
- One more per-part Newton solve per flight step per part (a few iterations; negligible next to Rapier).
- Out of scope, follow-ups: plasma blackout, conduction between parts, per-face heating, a HUD readout, convective cooling in dense air.
