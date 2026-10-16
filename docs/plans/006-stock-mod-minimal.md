---
id: 006
title: Stock mod, minimal
status: done
owner: "stock session (Claude, 2026-10-16)"
depends: [005]
phase: 0
created: 2026-10-16
updated: 2026-10-16
---

# 006 — Stock mod, minimal

## Goal

`mods/stock` registers, through `@orbital/sdk` only, everything needed to reach orbit: resources (liquid fuel, oxidizer, electric charge), modules (command, resource container, engine, decoupler, reaction wheel), 6 parts, and one home body ("Kerbin-scale", see product spec). It boots through the loader and is the reference example for modders. The part set is chosen so that a two-stage vessel built from it can reach orbit around the home body (the exit test of plan 007).

## Context

- Read: `docs/architecture/plugin-system.md` (as rewritten by 005 to the shipped API), `product/spec.md` §4, `glossary.md`, `architecture/boundaries.md`, `architecture/simulation.md` (what plan 007 will do with these definitions).
- ADRs: 0005, 0007, 0010, 0012 (part shapes), 0013 (define-API and loader).
- Journal entries of 005, 004, 008, 003.

## Scope

**In:** definitions + loader boot test + a `docs/guides/writing-a-mod.md` first draft generated from stock as the example; the minimal SDK/core additions stock needs (below), recorded in an ADR.
**Out:** meshes/art (placeholders: part dimensions only; renderer draws boxes/cylinders until art exists), balance tuning, running any module behaviour in a sim (plan 007), systems.

## Design notes

- Numbers in SI; use SDK helpers (`kN`, `km`, `tonnes`, …) at definition sites for readability. Resource amounts are in the resource's own unit (`u`, a KSP-style abstract unit; mass = amount × `density`).
- **SDK/core additions (sanctioned "fix the SDK" route, one ADR, `API_VERSION` 0.1.0 → 0.1.1 since additive):**
  1. `PartDefinition.shape?`: `{ kind: 'box', size: [x, y, z] } | { kind: 'cylinder', radius, height }` (metres, centred on the part origin, cylinder axis = local +Y). Same variants as the renderer's `PartShape` (ADR 0012), so the host maps it without logic; plan 007 derives `BodyDesc.shape` from it. Validated by `partDefinitionSchema`.
  2. `ModuleDefinition.state` receives the parsed config, `state?: (config: Out) => State`, so a container can start with its contents. Existing zero-argument factories stay valid.
  3. The SDK re-exports `createWorld` and `createEventBus`, so a mod's tests can build a `ModuleContext`.
- **Module hook policy.** `ModuleContext` has no body handle and no vessel resource graph, so a stock module cannot apply forces or move resources itself today. Stock modules therefore define: the config schema, the serializable state, `onStage`/`actions` that mutate that state only, and `snapshot`. Anything that needs the physics backend or other parts (thrust force, propellant flow, splitting a vessel, wheel torque) is performed by plan 007 reading the documented config and state; stock exports pure helpers for the arithmetic (`engineOutput`, container `withdraw`/`deposit`). The semantics are written down in the journal and the guide so 007 can implement them without guessing.
- **Resources** (`stock.` prefix): `stock.liquid-fuel` (density 5 kg/u, flow `stack`, unit `u`), `stock.oxidizer` (5 kg/u, `stack`, `u`), `stock.electric-charge` (density 1e-6 kg/u — the schema requires a positive density, and a massless-to-a-microgram unit is the honest encoding, `vessel`, `EC`).
- **Modules**: `stock.command` (no config), `stock.resource-container` (`contents: { [resource]: { capacity, amount? } }`, amount defaults to full), `stock.engine` (`thrust` = vacuum thrust in N, `ispVacuum`, `ispSeaLevel` in s, `propellants: [{ resource, ratio }]` with ratio by volume), `stock.decoupler` (`separates: 'top' | 'bottom'` default `'top'`, `ejectionImpulse` N·s), `stock.reaction-wheel` (`torque` N·m per axis, `chargeRate` EC/s at full demand).
- **Parts** (mass in kg, shape metres, nodes `top`/`bottom` at ±half height, dir ±Y):
  - `stock.command-pod` 840, cylinder r 0.625 h 1.0; command + container (50 EC).
  - `stock.reaction-wheel` 100, cylinder r 0.625 h 0.4; reaction wheel (torque 5 kN·m, 0.6 EC/s).
  - `stock.tank-small` dry 250, cylinder r 0.625 h 2.0; container 400 LF + 490 OX.
  - `stock.tank-medium` dry 500, cylinder r 0.625 h 4.0; container 800 LF + 980 OX.
  - `stock.engine-lv` 1 250, cylinder r 0.625 h 1.2; engine 215 kN vacuum, Isp 300 s vacuum / 280 s sea level, propellant ratio LF 0.9 : OX 1.1.
  - `stock.decoupler` 50, cylinder r 0.625 h 0.2; decoupler (separates `top`, 2 000 N·s).
  - The plan's "Isp 300/280 s" is read as vacuum/sea-level; "215 kN" is the vacuum thrust (sea-level thrust is `215 kN × 280/300` at constant mass flow).
- **Home body** `stock.home`: radius 600 km, μ = 3.5316e12 m³/s² (so `mass = μ / G`, G = 6.6743e-11), rotation period 21 600 s, atmosphere height 70 km, scale height 5.6 km, surface pressure 101 325 Pa. No `parent`/`orbit` (root body). Classic KSP-like numbers; they make a quick ascent possible. Not changed from the draft, so no ADR for the body.
- **Capability check for plan 007's exit test.** Reference two-stage vessel (top to bottom): pod, reaction wheel, tank-small, engine-lv, decoupler, tank-small, engine-lv. Stage 1 ignites the lower engine; stage 2 fires the decoupler and ignites the upper engine. The journal holds the Tsiolkovsky numbers (wet 12 890 kg, TWR 1.59 at sea level, Δv about 4 200 m/s against roughly 3 400 m/s needed from this surface); the stock tests assert the vessel's Δv and TWR from the registered definitions, so a later edit that breaks it fails a test.

## Steps

1. Core/SDK additions: `shape` in `partDefinitionSchema` (`packages/core/src/schemas.ts`) with tests; `state(config)` in `ModuleDefinition` (`definitions.ts`); `createWorld`/`createEventBus` re-exports and `API_VERSION` 0.1.1; ADR 0014 + index; update `architecture/plugin-system.md`.
2. `mods/stock/src/resources.ts`, `modules.ts` (+ `engine.ts` pure helpers if it grows), `parts.ts`, `bodies.ts`, `index.ts` as `definePlugin` (`meta.id` `stock`).
3. Tests in `mods/stock/test/`: boot report lists exactly the expected ids; every part's module configs validate; module hooks and actions behave; a test plugin depending on stock types check; reference vessel capability (Δv, TWR).
4. `docs/guides/writing-a-mod.md` draft.
5. Journal; docs checklist.

## Acceptance criteria

- [x] `bun test mods/stock` passes: boot report contains exactly the expected ids (list them in the test: 3 resources, 5 modules, 6 parts, 1 body, 0 systems), and the reference vessel's computed Δv is at least 3 800 m/s with sea-level TWR above 1.3.
- [x] `grep -rn "@orbital/core\|@orbital/sim\|@orbital/physics" mods/stock/src` returns nothing.
- [x] `bun test packages/core packages/sdk` passes including the new `shape` schema tests and the `state(config)` type test.
- [x] `bun run typecheck`, `bun run docs:check` pass; `bun test` and `bun run build` pass.

## Docs checklist

- [x] `docs/STATUS.md`, journal, `docs/guides/writing-a-mod.md`, ADR 0014 (shape field, `state(config)`, SDK test exports), `architecture/plugin-system.md`, glossary if terms added, `docs/README.md` directory table (`guides/`).

## Log

- 2026-10-16 — Created as draft.
- 2026-10-16 — Refined draft → ready at the human's request (session: stock session). Added the part shape/`state(config)`/test-export SDK additions (ADR 0014), module and part tables with numbers, the vessel-capability criterion. The draft's numbers are unchanged; unspecified ones (engine, wheel and decoupler masses, tank-medium, dimensions, torque) were filled in. Δv check: see journal 006.
- 2026-10-16 — Started (stock session).
- 2026-10-16 — Done. Evidence: `bun test mods/stock` 22 pass (boot ids, config validation, hooks, vessel Δv 4 299 m/s ideal / TWR 1.59); `grep -rn "@orbital/core\|@orbital/sim\|@orbital/physics" mods/stock/src` no output; `bun test packages/core packages/sdk` 88 pass; `bun test` 191 pass; `bun run typecheck`, `bun run build`, `bun run docs:check` pass. Interpretations: "Isp 300/280 s" = vacuum/sea level, "215 kN" = vacuum thrust. Added (ADR 0014): `PartDefinition.shape`, `state(config)`, SDK `createWorld`/`createEventBus` exports, `API_VERSION` 0.1.1. Details and the contract for plan 007: journal 006.
