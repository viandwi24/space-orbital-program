# 242 — Lights: a stock light part with on/off, colour and the lights group

**Plan:** [plans/242-light-part.md](../plans/242-light-part.md) · **Session:** Worker A, 2026-10-20 · **ADRs:** [0239](../decisions/0239-vessel-lights.md), 0174

## What was done

| Where | What |
|---|---|
| `mods/stock/src/lights.ts` | `stock.light`: on, colour, brightness, blink; the `stock.lights` toggle; EC drain in flight and on rails; goes out without charge |
| `mods/stock/src/parts/lights.ts`, `tech.ts` | `stock.light-spot` and `stock.light-flood` (radial), unlocked by Electrics |
| `core/schemas.ts` | `PartVisual.lamp`; API 0.1.94 |
| `renderer` | generator `light`, `effects/lamp.ts` (lens and reading), `lamps.ts` (`chooseLamps`, `LampPool`, `LAMP_BUDGET` 4), `SceneModel.updateLamps` |
| tests | stock `lights.test.ts`, sim `lights.test.ts` (U toggles both lamps, charge drops), renderer `lamps.test.ts` (budget, culling, lens, blink) |

## Not done

E2E (paused by the owner). The lens and the spot lights were not looked at in a browser, so their strength (`LAMP_POWER`) is a guess; the Hangar shows the lamps unlit. The plan's "depends: 241" was not needed. `bun test` at the repository root runs the web unit tests under the wrong runner and rewrites a golden snapshot: use `bun run test` or name the packages.
