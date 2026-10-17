# 124 — The real solar system pack ("Sol"): 1:1 and rescaled, balanced per scale

**Plan:** plans/124-real-solar-system-pack-scales.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode, autopilot · **ADRs:** [0184](../decisions/0184-systems-variants-loader-selection-sol-pack.md) (new), [0103](../decisions/0103-time-calendar-sun-and-the-real-solar-system.md), [0183](../decisions/0183-body-path-models-kepler-rates-series-osculating.md) · **Research:** [`ephemerides.md`](../research/ephemerides.md) (JPL physical parameters, IAU 2015 rotation via NAIF `pck00011`, Horizons sky references; read 2026-10-18)

**Status when written: criteria met here, handed over as `ready/124`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core` | `defineSystemVariant` and the `systemVariants` registry; `loadPlugins(…, { system })` keeps one system's bodies and applies the variant's patches; loader-only `removeDefinition`; `rotation.epoch: 'j2000'`; `API_VERSION` 0.1.53 (0.1.52 was taken on main) |
| `packages/sim` | `createSim` loads the world's system and variant, falls back to the variant's home; J2000 spin shifted by the world epoch |
| `packages/sdk` | `defineSystemVariant`, `levelAElements`, `AU`, `poleQuaternion`, `VesselDesign` |
| `mods/sol` (new) | the Sun, eight planets (Level A), the Moon (Almanac, J2000 ecliptic), IAU poles and prime meridians in the ecliptic; variants `1:1` and `rescaled` (k = 1/4: ×k sizes, ×k² masses, ×k^(2/3) distances, ×½ air); balance patches; reference designs |
| `apps/web` | built-in plugins (Stock, Sol); catalogs load one system; Create World: system select, variants with Δv and Moon transfer time; a Sol world's site on the Earth; the flight HUD on the world's system |
| tests | `packages/sim/test/sol-validation.test.ts` (6), `packages/sim/test/sol.test.ts` (4), `mods/sol/test/sol.test.ts` (5), Create World vitest (+1) |
| docs | ADR 0184, research, mod guide, plugin-system, simulation, product spec |

## Decisions and deviations

- **The loader chooses the system,** not the sim. The host, the renderer and the HUD read `sim.registries`, which would otherwise list two Suns.
- **Rescaled keeps periods and gravity real** (ADR 0184 point 5). With sizes, masses and distances on one factor, the Moon's real phases would not match its orbit.
- **Balance as measured:**
  - 1:1: the stock engine at 1.2 MN with Isp 420/360 s (hydrolox-like), tanks 40 % lighter, a heat shield of 300 kg at 12 MJ/kg;
  - rescaled: the engine at 400 kN, Isp 330/300 s.

  Every value came from the suite's runs (below).
- **The suite lives in `packages/sim/test`,** not in `mods/sol` or `packages/scripting` as the plan first said. It needs the sim and its mission helpers. The transfer is flown by a fresh transfer stage placed in the orbit the rocket reached, because the ascent stack spends its fuel. The re-entry uses a shielded probe from the top of the air at orbital speed.
- **`createAscent` gained two options** (`engine`, `stageAnyPhase`), backward compatible. It used to stage only in the ascent phase, and it timed the circularisation burn on stock's engine.
- **Only the Earth has an atmosphere.** Other planets' atmospheres are a later plan.
- **The sky check tolerance is 0.2° for the Sun's declination.** The game frame is the J2000 ecliptic, so 26 years of precession (0.14° at the 2026 equinox) separate it from Horizons' equator of date.
- **Not checked in a browser here** (no WebGL 2 in the pane). Create World is tested by server rendering and svelte-check.

## Measurements

| Check | 1:1 | rescaled |
| --- | --- | --- |
| Orbit reached (apoapsis × periapsis) | 202 × 120 km at 379 s (air 100 km) | 90 × 62 km at 423 s (air 50 km) |
| Transfer: planned miss / sphere | 8 274 / 66 183 km | 11 668 / 26 265 km |
| In the Moon's sphere after departure | 4.33 days | 5.54 days |
| Entry speed, peak temperature | 7 809 m/s, 748 K | 3 875 m/s, 702 K |
| Station hears a 100 km lunar orbiter | 29 % of two days | 34 % |
| Sun declination error (03-20 / 06-21) | −0.142° / −0.002° | same |
| Moon elongation error | 0.039° / 0.165° | same |

## Follow-ups

- Atmospheres for Venus, Mars and the giants. Minor bodies. DE440 (125). Scripts' `bodies[].state` and the planner on the path models. Real topography. Measuring the rescaled Δv to orbit precisely: the pack states 5 km/s from the circular speed plus typical losses.

## Verification output

```text
bun test packages/sim/test/sol-validation.test.ts  6 pass (both variants; numbers in Measurements)
bun test packages/sim/test/sol.test.ts             4 pass
bun test mods/sol                                  5 pass
vitest src/lib/worlds, src/lib/mods                28 + 27 pass
bun run docs:check                                 exit 0
bun run test                                       1588 pass, 2 fail under load (470 s): determinism (5 s timeout,
                                                   passes alone) and the mod-stock patch benchmark (M5-indicative
                                                   50 ms; 40-52 ms here before and after this plan)
bun run typecheck                                  exit 0 (104 s; svelte-check 0 errors)
bun run build                                      exit 0 (8 s)
bun run --filter @orbital/web test                 952 passed; 4 env-only import suites (no Node here: editor-options,
                                                   settings, WarpControl, and 112's dock, which imports settings);
                                                   runtime.test updated for the built-in Sol plugin
```
