# 006 — Stock mod, minimal

**Plan:** plans/006-stock-mod-minimal.md · **Session(s):** stock session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

No scaffolding; no new dependencies; nothing looked up online (the only external constant is G = 6.6743e-11, CODATA 2018, used once to turn μ into a body mass), so `research/` is unchanged. The draft was refined to `ready` at the human's request, then implemented.

| File | Contents |
|---|---|
| `core/src/schemas.ts`, `definitions.ts`, `version.ts` | `partShapeSchema` + `PartDefinition.shape?`; `ModuleDefinition.state?(config)`; `API_VERSION` 0.1.1 |
| `sdk/src/index.ts` | exports `createWorld`, `createEventBus`, `partShapeSchema`, `PartShape` |
| `mods/stock/src/resources.ts` `modules.ts` `engine.ts` `parts.ts` `bodies.ts` `index.ts` | the content below |
| `mods/stock/test/{boot,modules,vessel}.test.ts`, `helpers.ts` | 22 tests |
| docs | ADR 0014, `guides/writing-a-mod.md`, `architecture/plugin-system.md`, glossary, plan 007 Log note |

## The contract plan 007 implements

Ids: resources `stock.liquid-fuel`, `stock.oxidizer`, `stock.electric-charge`; modules `stock.command`, `stock.resource-container`, `stock.engine`, `stock.decoupler`, `stock.reaction-wheel`; parts `stock.command-pod`, `stock.reaction-wheel`, `stock.tank-small`, `stock.tank-medium`, `stock.engine-lv`, `stock.decoupler`; body `stock.home`; plugin `stock` (`import { Stock } from '@orbital/mod-stock'`; also the default export).

Hooks are pure state transitions; the sim applies effects. For each module, with `cfg = parseModuleConfig(...)`, `state = module.state(cfg)`:

| Module | Config (SI) | State | Sim semantics |
|---|---|---|---|
| `stock.command` | none | none | part is a control source; vessel is controllable while one exists |
| `stock.resource-container` | `contents: { [resourceId]: { capacity, amount? } }` (units; amount defaults to capacity) | `{ amounts: { [resourceId]: number } }` | the vessel's resource store; mass = dry mass + Σ amount × `density`. Use `withdraw(state, id, amt)` / `deposit(cfg, state, id, amt)` (return the amount moved) |
| `stock.engine` | `thrust` N (vacuum, full throttle), `ispVacuum` s, `ispSeaLevel` s, `propellants: [{ resource, ratio }]` (ratio by volume) | `{ ignited, throttle (0..1), flameout }` | each step: write vessel throttle into `state.throttle` (or call action `setThrottle`); `engineOutput(cfg, state, pressurePa)` → `{ thrust, massFlow, isp }`; apply `thrust` along the part's local +Y (see below); `propellantRates(cfg, massFlow, densityOf)` → units/s per resource, multiplied by `dt`, withdrawn from reachable containers (flow mode `stack`); any shortfall → action `flameout`. `onStage` ignites |
| `stock.decoupler` | `separates: 'top' \| 'bottom'` (default `'top'`), `ejectionImpulse` N·s (default 2 000) | `{ decoupled }` | `onStage` sets `decoupled`; when the sim sees it flip it removes the joint between the decoupler and the part attached at the `separates` node, splits the vessel there, and applies `ejectionImpulse` as an equal and opposite impulse on the two halves (along the node `dir`). The decoupler stays with the side that is *not* `separates` |
| `stock.reaction-wheel` | `torque` N·m per axis, `chargeRate` EC/s at full demand (default 0) | `{ enabled }` | if enabled and EC available: torque = demand × `torque` per axis (demand from the attitude command); EC draw = `chargeRate` × |demand|, flow mode `vessel` |

Engine direction: the exhaust leaves along the part's local -Y, so thrust acts along +Y of the part. The stack's local +Y is "up" with the command pod on top; the nodes confirm it (`top` dir +Y). Thrust acts at the engine part, so it is torque-free only while the centre of mass is on the thrust line, which holds for straight stacks.

Isp and thrust: `thrust` is the vacuum rating. Mass flow is `throttle × thrust / (ispVacuum × g0)` and does not depend on pressure; Isp interpolates linearly with `p / 101 325` (clamped to 0..1) between vacuum and sea level; thrust = mass flow × Isp(p) × g0, `g0 = 9.80665` (`G0` is exported). At the pad the LV engine gives 200.7 kN at 73.08 kg/s.

Parts (kg, metres; all 1.25 m class cylinders, radius 0.625, nodes `top`/`bottom` on the axis at ±height/2, dir ±Y):

| Part | Mass | Height | Modules |
|---|---|---|---|
| `stock.command-pod` | 840 | 1.0 | command; container 50 EC |
| `stock.reaction-wheel` | 100 | 0.4 | wheel 5 000 N·m, 0.6 EC/s |
| `stock.tank-small` | 250 dry | 2.0 | container 400 LF + 490 OX (wet 4 700) |
| `stock.tank-medium` | 500 dry | 4.0 | container 800 LF + 980 OX (wet 9 400) |
| `stock.engine-lv` | 1 250 | 1.2 | engine 215 kN vac, Isp 300/280, LF 0.9 : OX 1.1 |
| `stock.decoupler` | 50 | 0.2 | decoupler, separates `top`, 2 000 N·s |

Body `stock.home`: radius 600 000 m, mass = 3.5316e12 / 6.6743e-11 kg (μ = 3.5316e12 m³/s², surface g = 9.81 m/s²), rotation 21 600 s, atmosphere height 70 000 m, scale height 5 600 m, surface pressure 101 325 Pa, no parent.

### Intended exit-test vessel and Δv

Top to bottom: `command-pod`, `reaction-wheel`, `tank-small`, `engine-lv`, **decoupler**, `tank-small`, `engine-lv`. Stage 1: ignite the lower engine. Stage 2: fire the decoupler (severs its `top` node, so the decoupler leaves with the lower stage) and ignite the upper engine.

```
upper stage wet  840 + 100 + 4700 + 1250     = 6 890 kg  (dry 2 440)
lower stage wet  50 + 4700 + 1250            = 6 000 kg  (dry 1 550, 4 450 kg propellant)
liftoff          12 890 kg, sea-level thrust 200.67 kN, TWR 1.59 (g = 9.81)
stage 1 Δv  = 300·g0·ln(12890/8440)  = 1 245 m/s (vac Isp; about 1 160 m/s at 280 s)
stage 2 Δv  = 300·g0·ln(6890/2440)   = 3 054 m/s
total       = 4 299 m/s ideal (vac Isp), about 4 215 m/s counting sea-level Isp for stage 1
upper stage TWR (vacuum, ignition) = 3.2
```

The need: circular speed at 80 km is sqrt(μ / 680 km) = 2 279 m/s; the usual KSP-like cost from this surface is about 3 400 m/s including gravity and drag losses. Budget 4 215-4 299 m/s leaves 800+ m/s of margin, enough for a crude gravity turn. Heavy variant (medium tank in the lower stage instead): Δv 5 128 m/s but sea-level TWR 1.16, which wastes more to gravity at liftoff; recommended only if the crude ascent profile in 007 struggles. No part number had to change from the plan, so no ADR for them; the body numbers are unchanged too.

`vessel.test.ts` recomputes these from the registered definitions; changing a tank capacity to 100 u made four of its tests fail (checked and reverted).

## What surprised me

- **Hooks cannot do the real work.** `ModuleContext` has an `entity` and `physics` but no body handle and no access to other parts' resources, so an engine hook cannot apply thrust and a tank cannot be drawn from. Stock therefore ships declarative modules (config, state, state-only hooks and actions, `snapshot`) plus pure arithmetic helpers, and plan 007 owns the effects. Two ways for 007 to do it, recorded in its Log: (a) the sim reads the documented stock config/state (couples sim to stock module ids or to a generic capability protocol), or (b) extend `ModuleContext` additively (body handle, vessel resource access) so the hooks above get real `update` bodies. I implemented neither: it is 007's design, and guessing a context shape here would be inventing API.
- `state: () => State` made container fill impossible; `state(config)` was the smallest fix. Writing it with `Bivariant<...>` broke inference of `State` (ReturnType of a generic), so it is a method signature. A `test-d` case covers it.
- `density` must be positive, so electric charge got 1e-6 kg/EC instead of a schema change.
- `tank-small` with 890 u at 5 kg/u holds 4 450 kg in a 250 kg tank (mass ratio 18.8), far above KSP's tank ratios. Left as specified ("balance tuning" is out); it is the reason the vessel has so much margin.
- The plan's "Isp 300/280 s" does not say which is which; read as vacuum/sea level (physical). Likewise "215 kN" is read as the vacuum rating. Both stated in the plan Log and the guide.
- Mods cannot import core, so a test cannot build a `ModuleContext` without the SDK exporting `createWorld`/`createEventBus`; added (test support, ADR 0014).
- G is nowhere in core or kepler. Stock holds `HOME_MU` and a local `G`; plan 007 should decide whether `G` belongs in core units.
- Tooling: macOS `sed -i` needs a suffix argument; used perl for the plan/board edits.

## Decisions made (link ADRs)

- ADR [0014](../decisions/0014-part-shape-and-module-state-from-config.md): `PartDefinition.shape`, `state(config)`, SDK test exports; `API_VERSION` 0.1.1.

## Open questions / follow-ups

- Plan 007 refinement: module effects (see above), vessel design format, deriving `BodyDesc.shape` from `PartShape` (box -> box; cylinder -> capsule `halfHeight = max(h/2 - r, 0)`, or a box fallback), where `G` lives, decoupler placement convention (`separates`), `stagingIcon` strings are free-form (`command`, `wheel`, `tank`, `engine`, `decoupler`).
- Plan 009 builds the renderer's `partShapes` map from `PartDefinition.shape` (tuple -> `Vec3`).
- No new draft plans: the open items belong to 007/009, which exist.

## Verification output

```
$ bun test mods/stock                   22 pass, 0 fail (3 files)
$ bun test packages/core packages/sdk   88 pass, 0 fail
$ bun test                              191 pass, 0 fail (23 files)
$ bun run typecheck                     7 packages Exited with code 0; @orbital/web check 0 ERRORS
$ bun run build                         @orbital/web build ✔ done
$ bun run docs:check                    docs-check: OK (11 plans, 14 ADRs)
$ bunx prettier --check .               All matched files use Prettier code style!
$ grep -rn "@orbital/core\|@orbital/sim\|@orbital/physics" mods/stock/src    (no output)
```
