---
id: 343
title: "Mod World API: world queries, gated commands, mod state, events reference, mod keys and notices"
status: done
owner: "mod world API session (Claude)"
depends: [310, 330, 333]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 343 — Mod World API

## Goal

A mod can read the whole game ("get all vessels", their parts, resources, crew, orbits, comms; bodies, sites, roster, economy, time) through one typed, read-only facade; act on it through the sim's own commands within the world's rules; keep its own state in the save; react to a documented list of events; and give the player keys and notices. All of it from `@orbital/sdk`, versioned, with a runnable example.

## Context

- Owner's question (2026-10-22): does the mod system expose the whole game, e.g. "get all entities"?
- ADRs 0013 (SDK), 0015 (capabilities), 0057 (mods are trusted code), 0111 (rules), 0149 (panels read the snapshot), 0200/0213 (debug access), 0271 (vessel pilot, autopilots), 0276 (program sources), 0285 (panels, autopilot log), 0288 (panel input). New **ADR 0292**.
- Code read: `packages/sdk/src/*`, `packages/core/src/{plugin,definitions,events,panels,autopilots,vessel-pilot,protocol,save}.ts`, `packages/sim/src/{sim,autopilot,commands,snapshot,debug,programs,science}.ts`, `apps/web/src/lib/{keybindings,messages,sim-host,toasts}.ts`.

## Audit (2026-10-22)

| Need (KSP-class mod) | Today | Gap | This plan |
|---|---|---|---|
| Content: parts, modules, resources, bodies, buildings, contracts, science, comms, tech, crew traits, scenarios, blueprints | exists: 40 registrars on the plugin context | — | — |
| Data patches over other mods | exists: `definePatch` (ADR 0170) | — | — |
| Per-part code | exists: module hooks with `ctx.world` (raw ECS), `ctx.vessel` (capabilities) | raw ECS only; no view of other vessels | modules unchanged (systems are the place) |
| Whole-world code | exists: `defineSystem` (pre-/post-physics, world-tick) with registries, events, rules | gets the raw `World` only; no stock example | **ctx.world** (query), commands, store, notify; example |
| List and find vessels (type, situation, SOI, distance) | missing: only `snapshot.vessels` in panels, own+target in autopilots | missing | **WorldQuery.vessels(filter)**, `vessel`, `findVessel`, `nearest`, `distance` |
| A vessel's parts, modules, resources, crew, orbit, comms link | partly: raw snapshot fields in panels | no stable view | `parts`, `resources`, `crewOf`, `orbit`, `comms` |
| Bodies and their state (radius, μ, SOI, atmosphere, position) | partly: `snapshot.bodies` (id, position, rotation); facts in registries | not joined | `bodies()`, `body(id)` |
| Sites and buildings, crew roster, economy, time, warp, rules | partly: snapshot fields | no stable view | `sites`, `crew`, `economy`, `time`, `paused`, `day`, `rule` |
| Flying a vessel | exists: `VesselPilot` (ADR 0271) in autopilots | — | autopilots also get the world ctx |
| World commands (target, warp, stage, action groups, nodes, alarms) | missing for systems; panels send player commands | missing | **ModCommands**: `send` plus typed helpers, source `mod` |
| Spawn and terminate vessels | missing for mods | missing | only while debug tools are allowed (sandbox, or debug mode on) |
| Switch the active vessel | missing (the page owns it) | missing | `focus(vessel)`: a `mod:focus` event the page follows |
| Mod state saved with the world | missing (module state per part only; autopilot memory per vessel) | missing | **defineStore** (zod schema, initial), saved in `SimSave.stores`, read by panels |
| Events mods can subscribe to | exists: typed `EventMap`, ~60 events | no reference; no situation change (landing, orbit) | **SIM_EVENTS** catalogue, `vessel:situation-changed`, system `on` handlers |
| Contract complete, docking, SOI, staging, crash | exists: `objective:completed`, `vessel:docked`, `vessel:soi-changed`, `stage:activated`, `vessel:destroyed`, `part:damaged` | documented nowhere | in the catalogue |
| Mod keybindings | missing | missing | **defineKeybinding**: listed under Controls → Mods, rebindable; a command or a `mod:key` event |
| Toasts and notices from mods | partly: panel `notice` node only while the panel is open | missing | `notify(text, tone)` → `mod:notice` → a toast |
| Dock panels, custom UI | exists (ADRs 0149, 0285) | panels see the raw snapshot | `input.world` (the same facade) |
| Docs, example, tests | partly: `writing-a-mod.md` covers content | no API reference | API reference section, `examples/mod-world-api`, tests |

## Scope

**In:** the six rows marked in bold above, the SDK exports, API 0.1.106, the guide, an example mod, tests.
**Out:** a query view for module hooks (systems cover it), mod-to-mod RPC (plugins already have `contributes`), writing stores from panels, e2e.

## Steps

1. Plan, ADR 0292.
2. Core: `world-query.ts` (types and `createWorldQuery` over a `Snapshot` and the body registry), `stores.ts` (`defineStore`, registry), `keybindings.ts` (registry), `SIM_EVENTS`, new events, `SystemContext` and autopilot ctx types, `Snapshot.stores`, `SimSave.stores`; tests. Commit, push.
3. Sim: `mod-runtime.ts` (per-plugin ctx: lazy world, commands with source `mod` and the gate, store, notify, focus), systems and autopilots get it, `on` handlers, `vessel:situation-changed`, stores saved and resumed, `mod-key` command; tests. Commit, push.
4. SDK: exports, `defineStore`, `defineKeybinding`, API bump. Web: `input.world`, notices as toasts, focus, mod keys in the controls editor and flight keys. Commit, push.
5. `examples/mod-world-api`, guide API reference, journal, STATUS. Commit, push.

## Acceptance criteria

- [x] `bun test packages/core/test/world-query.test.ts`: vessels filtered by type, situation, SOI and distance; parts, resources, crew, orbit, comms; bodies joined with their facts.
- [x] `bun test packages/sim/test/mod-runtime.test.ts`: a system lists vessels, sets a target, stages, warps; spawn and terminate refused while debug is locked and accepted in sandbox; a store survives save and resume and rejects invalid values; `vessel:situation-changed` fires on landing and on reaching orbit; a notice and a focus event reach the bus.
- [x] `bun test examples/mod-world-api`: the example boots in a sim and does its job.
- [x] web vitest: a mod notice becomes a toast; mod keybindings resolve with overrides and clashes.
- [x] `bun run typecheck`, `bun run docs:check` pass.

## Docs checklist

- [x] ADR 0292.
- [x] `docs/guides/writing-a-mod.md`: API reference (World Query, Commands, Stores, Events, Keybindings, Notices), API 0.1.106.
- [x] `docs/STATUS.md` board row, journal `docs/journal/343-mod-world-api.md`.

## Log

- 2026-10-22 — Audit written; implementing.
- 2026-10-22 — Done. `bun test ./packages ./mods ./examples ./tools`: 2244 pass, 0 fail (752 s, niced under the heavy lock). `bun test packages/core/test/world-query.test.ts packages/sim/test/mod-runtime.test.ts examples/mod-world-api`: 16 pass. Web vitest (CI=true): 1504 pass, 2 fail in `sim-host-script-worker.test.ts`, which spawns Node with `--experimental-transform-types`, a flag Node 26 on this machine no longer accepts (environment, not this plan). svelte-check: 0 errors, 0 warnings; package typechecks exit 0; `bun run docs:check` OK. Career bot (3 600 days): 14.2 s against 14.6 s before the plan.
