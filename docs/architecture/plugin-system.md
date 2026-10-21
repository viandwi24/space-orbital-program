# Plugin system

A modder adds a working engine with one TypeScript file, fully typed, with no change to core. Stock content is built the same way (ADR 0005). This document describes the API as shipped by plan 005 (`API_VERSION` 0.1.13; decisions in ADR 0013, 0014, 0015, 0019, 0028, 0033, 0034, 0035, 0045, 0049, 0050 and 0051). Code lives in `packages/sdk/src/define.ts` (define functions, inference types) and `packages/core/src/{plugin,definitions,semver}.ts` (loader, runtime shapes).

## Three levels of definition

```
Plugin  — unit of distribution. Registers things. Has id, version, dependencies.
  └─ Module  — reusable behaviour with a config schema and serializable state.
       └─ used by Part — pure data: mass, mesh, attach nodes, [module, config] list.
```

Also registered by plugins: **Resources** (things that flow), **Bodies** (planets), **Systems** (per-step logic over the world).

## The define-API (`@orbital/sdk`)

### `definePlugin`

```ts
import { definePlugin } from '@orbital/sdk';

export default definePlugin({
  meta: { id: 'acme.nuclear', version: '1.0.0', api: '^0.1' },
  depends: [Stock],                 // plugin *instances* -> types flow into ctx
  optional: [LifeSupport],          // soft deps; ctx.optional.lifeSupport?: ...
  contributes: {} as {
    nuclear: { reactorTemp(part: PartId): number };
  },
  setup(ctx) {
    ctx.resources.register(Uranium);
    ctx.modules.register(ModuleReactor);
    ctx.parts.register(PartNerva);
    ctx.events.on('reactor:meltdown', (e) => { /* typed */ });
    ctx.provide('nuclear', { reactorTemp });
  },
});
```

- `meta.id` is lower-case kebab segments joined by `.`; it is the `by` recorded for every registration. `meta.version` is `x.y.z`. `meta.api` is a range checked against `API_VERSION`.
- `depends`/`optional` take plugin instances (typed) or id strings (ordering/presence only, no types). Only a plugin's *direct* dependencies' `contributes` appear in `ctx` (merged into one object via `MergeContributes`); a plugin that does not list `A` gets a compile error on `ctx.a`. Optional dependencies appear as `ctx.optional.<key>` typed `T | undefined` and are `undefined` at runtime when the plugin is not loaded.
- `contributes` is type-only (the value is ignored at runtime); `ctx.provide(key, impl)` supplies the implementation, checked against the declared type. A key can be provided once across all plugins, and the context names (`meta`, `events`, `parts`, `modules`, `resources`, `bodies`, `systems`, `optional`, `provide`) are reserved. A `contributes` key that is never provided is not detectable at load time (dependents see `undefined`).
- `setup` is synchronous. `ctx.parts/modules/resources/bodies/systems.register(def)` register on behalf of this plugin; `ctx.events` is the shared bus.

### Loader: `loadPlugins(plugins, options?)`

```ts
import { loadPlugins } from '@orbital/sdk';          // also exported by @orbital/core
const { registries, events, report } = loadPlugins([Stock, Nuclear]);
```

`options`: `registries?` and `events?` (reuse existing ones), `apiVersion?` (default `API_VERSION`).

1. Duplicate or malformed plugin id: throws `PluginError`.
2. `api` range not satisfied by `apiVersion` (or unsupported syntax), malformed `version`: the plugin is **disabled** with a reason.
3. Missing or disabled hard dependency: disabled with a reason; dependents are disabled transitively.
4. Kahn topological sort of the rest (ties broken by position in the input list, so the order is deterministic; optional dependencies that are present are ordering edges too). A cycle throws `PluginError` naming it (`a -> b -> a`).
5. `setup` runs in order. An exception is wrapped in `PluginError` naming the plugin; `RegistryError` (duplicate id naming both plugins, or a definition failing its schema) propagates unchanged. These are not recoverable: registrations cannot be rolled back.
6. Cross-check of every part against the module registry: unknown module, config rejected by the module's zod schema (message includes the zod issues), module listed twice, unmet `requires`. All problems are reported in one `PluginError`.

`report` is `{ order: string[], disabled: { id, reason }[], registered: Record<'part'|'module'|'resource'|'body'|'system', { id, by }[]> }`. `parseModuleConfig(module, config)` is the helper the sim uses to get the parsed config (defaults applied) for a part instance.

Semver (`satisfies(version, range)` in core, no dependency): ranges `*`, `x.y.z`, partial `x.y`/`x`, `^` and `~` with npm semantics (`^0.1` = `>=0.1.0 <0.2.0`). Anything else is rejected, not guessed.

### `defineModule`

```ts
export const ModuleEngine = defineModule({
  id: 'stock.engine',
  config: z.object({ thrust: z.number(), isp: z.number().default(300), propellants: z.array(z.string()) }),
  state: (config) => ({ throttle: 0, ignited: false }),   // serializable; no methods; gets the parsed config
  requires: ['stock.resource-consumer'],            // other modules on the same part
  onStage(ctx) { ctx.state.ignited = true; },
  update(ctx, dt) { /* apply thrust via ctx.physics.applyForce(...) */ },
  actions: { toggle: (ctx) => { ctx.state.ignited = !ctx.state.ignited; } },
  snapshot: (state) => ({ throttle: state.throttle }),   // what UI sees
});
```

- `z` is re-exported by the SDK (one zod copy for all mods). `config` is a zod schema: part definitions are type-checked against its **input** type at compile time and validated by the loader; hooks receive the parsed **output** (`ctx.config`, defaults applied). A module without `config` takes none.
- `state(config)` is created per part instance from the parsed config (ADR 0014) and lives in the world as a component (plan 007 owns the storage; ADR 0010 tokens). Functions live on the definition.
- Hook context (`ModuleContext`): `{ world, events, registries (read-only), physics, entity, config, state, vessel }`; `vessel` is the capability API below. `update` runs every fixed step in flight mode; `updateOnRails(ctx, dt)` on rails (must not use `physics`); `onStage(ctx)` when the part's stage fires; `actions` are callable from UI, staging and scripts; `snapshot(state)` returns JSON for the UI. `colliders(config, state)` (ADR 0019) returns extra collision boxes (`{ offset, halfExtents }` in the part frame, no mass) for the current state, e.g. deployed landing-leg feet; the sim rebuilds the vessel's body when a dispatched action or stage changes the result (a change made inside `update` takes effect at the next action, stage or split). `describe(config, state) => ModuleInfo` (API 0.1.7, ADR 0033) is the tool-facing counterpart of the hooks: pure data a tool reads to predict the module without running the sim, `engine` (`massFlow`, a `thrust` curve over ambient pressure, `propellants`, `ignited`, `flameout`) and `separator` (`node`, `done`). `moduleInfoSchema` validates it and `describeModule(def, rawConfig, view?)` (core, exported by the SDK) parses the part config, picks fresh state or the live `snapshot` view, calls it and validates the result; the web client's delta-v model, auto-staging and part card use only that. `PartDefinition.impactTolerance` (m/s) sets how hard the part may hit the ground; the sim emits `part:damaged` when it is exceeded. `PartDefinition.maxTemperature` (K) is the skin temperature above which the part is destroyed by re-entry heating (`part:damaged` with `cause: 'overheat'`), and `absorbHeat(ctx, { power, temperature }, dt) => watts` lets a module carry airflow heat away (stock's ablative heat shield burns its ablator for it; ADR 0023).
- Hooks are typed with a parameter-bivariant function type, which is what lets a typed definition be stored in the erased registry without casts.

#### Part actions (plan 110, API 0.1.34, ADR 0174)

`describe(config, state)` may return `actions`: descriptors `{ id, label, kind: 'toggle' | 'value' | 'trigger' | 'mode', value, min, max, step, unit, options, enabled, reason, group, icon }` (`partActionDescriptorSchema`). `id` names an entry of the module's `actions`: a toggle calls it with a boolean, a value with a number in `min..max`, a mode with an option's `value`, a trigger with nothing. `group` joins a registered `defineActionGroup({ id, label, icon?, order? })` (registered with `ctx.actionGroups`; stock: engines, batteries, solar, lights, antennas, science, docking, landing gear, parachutes). The command `action-group { vessel, group, value? }` calls every enabled member's action in one dispatch, and `groupState` gives `on`, `off`, `mixed` or `none`. The host builds the controls from `describeModule(module, config, view)`. The snapshot carries only `VesselSnapshot.actions` (group states and `[part, module, action, value, enabled]`).

Since plan 214 a descriptor may carry `units: [{ unit, factor }]` (other units its value reads in, `amount = value × factor`; the first is what the part inspector shows and what a bare typed number means: the engine limiter reads `%` and `kN`) and `more: true` (an advanced control the inspector keeps under "More"). `ModuleInfo.readouts` (plan 209) are the part's state as text; the inspector and the vessel panel show both.

#### The vessel capability API (`ctx.vessel`, ADR 0015, plan 007)

```ts
update(ctx, dt) {
  const { control, ambient, resources } = ctx.vessel;       // throttle/pitch/roll/yaw; pressure/density/altitude
  ctx.vessel.applyForce({ x: 0, y: thrust, z: 0 });          // part-local frame, this step only, flight only
  ctx.vessel.applyTorque({ x: 0, y: 0, z: torque });
  const air = ctx.vessel.airVelocity({ x: 0.2, y: 0, z: 0 }); // velocity of a part-frame point relative to the air, part frame (API 0.1.8, ADR 0035)
  const com = ctx.vessel.centreOfMass;                       // vessel centre of mass in the part frame, flight only (API 0.1.10, ADR 0045)
  const demand = ctx.vessel.torqueDemand;                    // attitude demand as a torque direction in the part frame: x pitch, y roll, z yaw
  const got = resources.withdraw('stock.liquid-fuel', 0.1);  // reachable per flowMode / crossfeed; amount() and deposit() too
  ctx.vessel.detach('top', 2_000);                           // sever the attachment at a node; impulse N·s
}
```

`ModuleDefinition.controlAuthority(ctx)` (API 0.1.11, ADR 0049) returns the largest torque per part axis the module can add now (N·m, x pitch, y roll, z yaw); the stability assist sizes its demand with it.

Forces, torques, `airVelocity` and `centreOfMass` throw on rails (`updateOnRails` must not use them). `PartDefinition.dragCoefficient` (API 0.1.8) replaces the default `C_d` 0.3 of a part. Attach nodes may not be named `surface` (reserved for radial attachment, ADR 0034). A node's optional `size` (API 0.1.75, plan 207, ADR 0212) is the diameter of its joint face in metres: the stock classes are `NODE_SIZES` 0.625, 1.25, 1.875, 2.5, 3.75, 5 and 7.5 (API 0.1.96, ADR 0256, plan 289); a stack node without one takes its cylinder part's class (`nodeSize`), and the Hangar warns when two joined nodes differ (`nodeSizesMatch`). Stock parts live in one file per family under `mods/stock/src/parts/` (`aero`, `command`, `comms`, `engines`, `ground`, `life-support`, `power`, `recovery`, `science`, `structure`, `tanks`; helpers in `shared.ts`), and part plans add to their family's file; a part with a horizontal node (`dir.y` 0) can hang on the side of a cylindrical part, and `detach(node)` cuts every attachment on the node. Control demand axes: pitch about +X, roll about +Y (the stack axis), yaw about +Z. Two more optional module fields let the sim stay generic: `store` (`resources/amount/withdraw/deposit`: this module holds resources, so the sim sums its mass and routes flow through it) and `controlSource: true` (the part makes the vessel controllable). `PartDefinition.crossfeed?: boolean` (default true) says whether resources may flow through the part. Events `vessel:mode-changed`, `vessel:created`, `vessel:destroyed`, `stage:activated` are in core's `EventMap`.

### `definePart`

```ts
export const PartEngineLV = definePart({
  id: 'stock.engine-lv',
  title: 'LV-T30 Liquid Engine',
  mass: 1250,
  mesh: 'models/engine-lv.glb',
  shape: { kind: 'cylinder', radius: 0.625, height: 1.2 },   // physics/heating geometry, metres (ADR 0014)
  visual: { kind: 'engine', palette: { primary: '#2d3138' }, plume: { module: 'stock.engine', nozzle: [0, -0.6, 0], exitRadius: 0.46, length: 7 } },   // look (ADR 0028)
  attach: { top: { pos: [0, 0.6, 0], dir: [0, 1, 0] }, bottom: { pos: [0, -0.6, 0], dir: [0, -1, 0] } },
  modules: [
    [ModuleEngine, { thrust: 215_000, propellants: ['stock.liquid-fuel', 'stock.oxidizer'] }],
    [ModuleCommand],                                // config-less module: [module] (or [module, undefined])
  ],
  stagingIcon: 'engine',
});
```

Config literals are checked against the module's schema input type (wrong type, missing required key, unknown key, config given to a config-less module are compile errors). `definePart` returns core's plain-data `PartDefinition`: each module object becomes `[module.id, config]`, config stored as written. String-id entries are accepted when the id is in `ModuleMap` (see augmentation), and a JSON part (`{ "modules": [["acme.reactor", { ... }]] }`) is the same shape; it is validated with `partDefinitionSchema` and then by the loader against the module's schema exactly like a TypeScript part. A part is pure data; it has no functions. `shape` (`{ kind: 'box', size: [x, y, z] }` or `{ kind: 'cylinder', radius, height }`, metres, cylinder axis = local Y) is the geometry used by the physics body and the heating model; the renderer draws it when a part has no `visual`. `visual` (`partVisualSchema`, API 0.1.6, ADR 0028) is a declarative look: a generator `kind` the renderer owns, a `palette`, flat `params`, an engine `plume` and a `deploy` animation, each naming the module whose snapshot drives it. It is pure data validated with the rest of the part, so a JSON mod can use it. The renderer turns it into meshes through its `PartModelProvider` chain, which is where asset-backed models plug in later.

### `defineResource`, `defineBody`, `defineSystem`

- `defineResource({ id, density, flowMode: 'stack' | 'vessel' | 'none', unit })`
- `defineBody({ id, mass, radius, rotationPeriod, atmosphere?: { scaleHeight, surfacePressure, height, aurora?, temperatureCurve?, gamma?, gasConstant? }, terrain?: { kind: 'hills' } | { kind: 'craters', seed? }, parent?, orbit? })` (`terrain`: API 0.1.18, ADR 0067; none = a smooth sphere)
  - `temperatureCurve` (plan 212, ADR 0204): `[altitude m, K]` keys in rising altitude, linear between, held beyond the ends; density is `p/(R·T)` and the speed of sound `√(γ·R·T)` (air: γ 1.4, R 287.05). Without a curve the air is 288.15 K everywhere. `STANDARD_ATMOSPHERE_TEMPERATURE` (SDK) is the 1976 standard atmosphere's layers to 100 km.
- `defineSystem({ id, phase: 'pre-physics' | 'post-physics' | 'world-tick', order?, update(world, dt, ctx) })`: `ctx` is `{ registries (read-only), events, rules }`; extra parameters may be omitted. A `world-tick` system (API 0.1.29, plan 082, ADR 0171) runs once per game day at the day boundary, in ascending `order` (default 0), then plugin boot order, then id, with `dt` = the day length and `ctx.tick = { day, time, rng }`. `rng` is the system's own PRNG stream from the world seed and its id, saved with the run. The sim emits `world:tick` `{ day, time }` after the systems.
- `defineDataKind({ id, label, priority, valueCurve? })` (API 0.1.31, plan 083, ADR 0172), registered with `ctx.dataKinds.register`: `priority` is an integer, lower first; `valueCurve` is `[ageSeconds, factor]` points (ascending ages, factors 0..1, linear, flat after the last). A module holds data items with `dataStorage: { capacity(config) }` and the state `{ items, next }`. Any module stores through `ctx.vessel.data.store(item)` (returns the id, or undefined when the item was dropped), `used()` and `capacity()`. Load report kind `data-kind`.
- A module may declare `background(ctx, dt)` (API 0.1.29): a closed form (rate × `dt`) for a vessel on rails, called on each world tick, when the vessel wakes and before a save. It replaces that module's `updateOnRails`.
- All three are typed identity functions; the registry validates them with zod (`schemas.ts`) on register.

### Objectives, contracts and missions (API 0.1.37, plan 098, ADR 0175)

- `defineObjective({ id, label, params, on?, constraint?, evaluate })` (registered with `ctx.objectives`): `evaluate(params, view, prior)` is pure and returns `{ status: 'active' | 'done' | 'failed', progress, data? }`. `view` is the read-only `ObjectiveView` (`time`, `home`, and `vessels` with `body`, `mode`, `landed`, `altitude`, `periapsis`, `apoapsis`; since plan 231 also `inclination`, `seats`, `crew`, `antenna`, `power`, `ports`, `docked`, and `rescues` for a contract that stranded crew). `prior` is the leaf's last result, and `data` is its memory. `on` is `'step'`, `'tick'` or event names (default `['step']`). A `constraint` leaf is re-evaluated every time; other leaves stay done.
- Trees: `{ objective, params }`, `{ all }`, `{ any }`, `{ sequence }` (a sequence evaluates only its current step). `evaluateObjectives(tree, leaves, lookup, view)` is the pure evaluator.
- `defineContract({ id, title, objectives, reward?, penalty?, deadline?, prerequisites? })` and `defineMission({ id, title, objectives, reward?, prerequisites? })` (`ctx.contracts`, `ctx.missions`). Their leaves are checked at load: the objective must be registered and its params must parse. Rewards and penalties are `{ currency, amount }` ledger entries.
- `defineAgency({ id, name, personality: { aggressiveness, risk }, budget: { start, monthly }, programme })` (`ctx.agencies`, report kind `agency`), plan 126, ADR 0190. A programme is a list of `{ id, kind: 'satellite' | 'relay', altitude, inclination?, cost, success, prepDays, lifeDays, rent? }` missions flown in turn. A world runs the first `stock.agency-count` registered agencies.
- `defineDiscoveryFact({ id, label, unit, chance, range: [min, max], tolerance, resolution, instruments })` (`ctx.discoveryFacts`, report kind `discovery-fact`), plan 129, ADR 0192. With `stock.science-depth` `discovery`, every non-star body has one of each kind from the world seed. Results of the listed data experiments measure it with `resolution` error. A claim within `tolerance` is accepted.
- `defineStrategy({ id, label, description, effects: [{ key, factor }], upkeep, agencyTypes?, cooldownDays? })` (`ctx.strategies`, report kind `strategy`), plan 101, ADR 0187. Keys are core's `STRATEGY_KEYS` (`launch-cost`, `recovery`, `science`, `reputation`, `contract-funds`, `budget`), each with bounds. A factor outside them fails at load. A charge may name a key in `multiplier`.
- `defineContractTemplate({ id, label, tier, minReputation?, weight?, maxOffers?, cooldownDays?, generate })` (`ctx.contractTemplates`, report kind `contract-template`), plan 099, ADR 0186. `generate(ctx)` is pure: it draws from `ctx.random()` and returns `{ key, title, brief, objectives, advance, reward, penalty, deadline, deltaV, spawn? }` or null. Since plan 231 (ADR 0231), `ctx.milestones` lists the world's firsts, and `spawn: { design, body, altitude, member? }` makes a vessel on accept (a rescue's pod with a stranded member). `estimatedLaunchCost(deltaV)` and `expectedValue(offer)` come from the SDK.
- Stock primitives: `stock.reach-orbit`, `stock.land`, `stock.reach-altitude`, `stock.enter-soi`, `stock.flyby`, `stock.return-home`, `stock.before`.

### Crew (API 0.1.38, plan 106, ADR 0176)
- `defineCrewTrait({ id, label, abilities, weight? })` (`ctx.crewTraits`): `abilities` are factors on the quality keys `controlSmoothing`, `scriptBudget`, `repairRate`, `dataQuality`, `gTolerance` and `panicResistance` (`ABILITY_KEYS`), never a tool (ADR 0098). `abilitiesOf(member, traits)` gives profession × level × traits.
- `defineCrewNames({ id, first, last })` (`ctx.crewNames`): syllables that hired crew names are drawn from, with the world's `crew` stream.
- Parts declare seats with `crewCapacity`.
- `defineSystemVariant({ id, system, variant, label, description, home, facts, patches })` (`ctx.systemVariants`, report kind `system-variant`), plan 124, ADR 0184. `loadPlugins(plugins, { system: { id, variant } })` keeps only that system's bodies and applies the variant's patches with the rest. `createSim` passes the world's `systemId` and `variant`. Without the option, every body stays.
- A module that scrubs CO2 declares `scrubber: (config) => ({ crew, charge })` (plan 107, ADR 0181): people served, and EC per person per day. Consumables are ordinary resources (`stock.supplies`, `stock.oxygen`, `stock.water`, `stock.food`) in any container.
- `defineSituation({ id, label, order, matches })` (`ctx.situations`) and `defineExperiment({ id, label, kind, situations, baseValue, repeatFactor, capFactor?, duration, power?, bits?, mass?, transmitFactor })` (`ctx.experiments`), plan 103, ADR 0178. Bodies may carry `science: { flyingHigh?, spaceHigh?, multiplier? }`. Modules get `ctx.vessel.situation()`, `ctx.vessel.science.result(experiment)` and `.credit(subject, value)`, the hook `onRecover`, and `ModuleInfo.experiment` for the snapshot. Load-report kinds are `situation` and `experiment`.
- Regions (plan 104, ADR 0180): bodies may carry `regions` (`biomes`, `cells` or `bands`), and situations `regional: true`. `defineDossierEntry({ id, label, order, fact, unlock })` (`ctx.dossierEntries`, report kind `dossier-entry`). Core has `regionAt`, `regionsOf`, `dossierOf` and `parseSubjectId`.
- `defineAntenna({ id, label, kind, range, power })` (`ctx.antennas`) and `defineGroundStation({ id, label, body, latitude, longitude, altitude?, range })` (`ctx.groundStations`), plan 114, ADR 0179. A module is an antenna through its `antenna(config, state)` hook (`{ antenna, enabled }`). Modules read the link with `ctx.vessel.signal()` (`{ connected, to, reason, control }`). Load-report kinds are `antenna` and `ground-station`. Tier 2 (plan 116, ADR 0185): `defineBand({ id, label, frequency, noiseTemperature })` (`ctx.bands`, report kind `band`), the antenna fields `band`, `gain` (dBi) and `aperture` (m), the station field `aperture`, and `signal().rate` (bit/s, or null without a budget). Tier 3 (plan 117, ADR 0188): `defineRoutePolicy({ id, label, choose(routes) })` (`ctx.routePolicies`, report kind `route-policy`; `choose` returns the index of a `{ hops, width, latency }` candidate), `AntennaDefinition.beamWidth`, the antenna hook's `target`, and `signal().latency`. Tier 6 (plan 121, ADR 0193): `AntennaDefinition.suit` makes a suit radio, relayed only by a crewed vessel in sight, with its range scaled by the crew `radio` ability.

### Autopilots and the vessel pilot (plan 310, ADR 0271)

`ctx.autopilots.register(defineAutopilot({ id, title, rate?, start, step }))` adds an autopilot the sim runs for one vessel at `rate` per second of sim time (default 10), before it chooses between a physics step and a rails chunk. `start(pilot, params)` returns the memory (plain JSON, saved with the vessel) or throws to refuse `autopilot-engage`. `step(pilot, memory, dt)` returns `{ phase, status?, readouts?, done?, abort? }`. The `VesselPilot` it gets (`createVesselPilot` in core) reads the vessel, its control part and target port and the port to port alignment, and sends every control as a command through the sim's own handler. The snapshot carries `vessel.autopilot`; `autopilot:ended` reports the end. A vessel with an engaged autopilot stays out of auto-rails. Code: `packages/core/src/vessel-pilot.ts`, `packages/core/src/autopilots.ts`, `packages/sim/src/autopilot.ts`; guide `docs/guides/vessel-pilot-api.md`; example `mods/autodock`.

### Dock panels (API 0.1.45, plan 112, ADR 0149)

`ctx.panels.register(definePanel({ id, title, icon, order, contexts, view, canvas? }))` adds a panel to the flight dock. `view` is a tree of plain nodes (`section`, `readout`, `meter`, `switch`, `button`, `list`, `sparkline`) whose functions are pure selectors over a `PanelInput` (snapshot, active vessel, altitude, speed, time) or return a `Command` the sim validates. `canvas.draw` receives a `PanelCanvas`, a declared subset of 2D drawing, so a panel needs no DOM types. The page evaluates panels at the 10 Hz HUD update, draws a canvas only while its panel is open, and shows a panel that throws as failed without stopping anything else. Code: `packages/core/src/panels.ts`, `apps/web/src/lib/dock/`.

## Type sharing between plugins

1. **`depends` → `contributes`:** typed API injected into `ctx` (above).
2. **Plain exports:** a plugin is a package; `import { ModuleEngine, type EngineConfig } from "@orbital/mod-stock"` works. External mods use `@orbital/sdk` as a `peerDependency` so there is one copy of the types.
3. **Module augmentation** for open registries. The interfaces `EventMap`, `ResourceMap` (resource id -> info) and `ModuleMap` (module id -> config input type) are declared in core and re-exported by the SDK. **Mods augment `'@orbital/sdk'`** (the only package they import); TypeScript merges through the re-export into core's declaration (verified by `packages/sdk/test/define.test-d.ts`, and from `mods/stock`):

```ts
import type { PartId } from '@orbital/sdk';
declare module '@orbital/sdk' {
  interface EventMap     { 'reactor:meltdown': { part: PartId } }
  interface ResourceMap  { 'acme.uranium': { density: number } }
  interface ModuleMap    { 'acme.reactor': { output: number } }
}
```

   After this, `ctx.events.on('reactor:meltdown', e => e.part)` is typed (unknown event names are compile errors), `ResourceKey` lists `'acme.uranium'`, and `definePart({ modules: [['acme.reactor', { output: 5 }]] })` is checked. Augmentations are global to the compilation, so they are visible to any code that can see the declaring file, not only to dependents. A file containing `declare module` must itself be a module (have an import or export).

## Loading

- In-repo plugins are imported statically and passed to the loader.
- External mods are installed as one JSON package and loaded at runtime (below, API 0.1.15, ADR 0057), validated (manifest, `api` range, dependencies, schemas), then booted in dependency order.
- The loader produces a **report** (see above): boot order, disabled plugins with reasons, what was registered and by whom. A same-id conflict between plugins is a `RegistryError` naming both.

### Mod packages and runtime loading (API 0.1.15, ADR 0057)

**Connector parts and engine axis (API 0.1.19, ADR 0071, plan 041).** `PartDefinition.connector?: { feeds?: boolean }` marks a strut (`{}`) or a fuel line (`{ feeds: true }`); `ModuleInfo.engine.axis?` (part frame, default +Y) is the thrust direction for tools; `PartSnapshot.link?` carries a connector's far end. `ModuleInfo.lift` also describes `stock.wing` (ADR 0075).

**Models in packages (API 0.1.20, ADR 0076, plan 051).** `PartVisual.asset?: string` names a `.glb` the mod's package ships (`kind` stays as the fallback generator). Format 2 packages add `assets` (`mod-assets.ts`: `modAssetSchema`, `inspectGlb`, `decodeAssets`, `modPackageFingerprint`, caps); `resolveMods` returns `partAssets` and the decoded `assets`, and rejects a mod whose part names a file the package lacks; the renderer's `GltfPartProvider` takes the bytes (`assets` option), draws plume, gimbal pivot (`moving` node) and glow, and `assetFit` warns about shape and node mismatches.

**Multi-nozzle engines (API 0.1.23, ADR 0081, plan 040).** `PartVisual.plume.nozzles?: [x, y, z][]` (2 to 9, part frame) lists the exit centre of every bell; each draws its own plume of `exitRadius` and `length`, `nozzle` stays the thrust centre the scene's ground effects use. Stock draws `stock.engine-cluster` with the `engine-cluster` generator (`params`: `bells`, `ring`, `bellExit`), whose layout `clusterLayout` the descriptor must equal.

**Lakes (API 0.1.21, ADR 0072, plan 038).** No signature changes: the home body's height function (`terrainHeight`, read by the sim and the renderer) is exactly zero on the floor of a lake and the relief around a lake is capped by a cone, so a vessel stands on a lake as on the sea. A mod's body gets none of this yet (hills on another body: draft 059).

**Descriptor additions (API 0.1.16, ADR 0060, plan 023).** `ModuleInfo` gains three optional fields so the HUD and the editor stop knowing stock module ids: `engine.throttle` (commanded throttle 0..1, read by the HUD gauge from a live view), `lift` (`{ area, liftSlope, crossflow, centre }`, a lifting plate for the stability read-out) and `category` (the catalogue category a module stands for: `command`, `propulsion`, `tanks`, `structural`, `aero`, `control`, `landing`, `thermal`). An engine, a separator and a `lift` imply theirs; a module with `controlSource` is a command part; a module with a `store` and nothing else is a tank. Stock modules describe themselves with them; a mod does the same.

Plugins outside the build ship as one JSON package (`*.orbital-mod.json`: `format`, `formatVersion`, `manifest`, `code`, `sha256`). Core (`mods.ts`) owns the format and the loader: `modManifestSchema`, `modPackageSchema`, `parseModPackage(text)` (JSON, shape, manifest, fingerprint; runs nothing), `createModPackage`, `modCodeHash`, `installModSdk(sdk)` (puts the SDK where a built bundle's shim reads it), `importModBundle(code)` (imports code text through a `blob:` URL; page, Worker, Bun, Node) and `resolveMods(bundles, { builtin, importModule })`, which returns `{ plugins, accepted, rejected }`: per bundle it checks duplicate ids (naming both), the API range, manifest dependencies, the import, the default export, the manifest against `meta`, and a trial `loadPlugins` so a throwing `setup` or a duplicate part id rejects that mod only. The web client runs it on the page (root layout `load`, `apps/web/src/lib/mods/runtime.ts`) and in the sim Worker (`init` carries the accepted bundles), so both boot the same set. `tools/mod-build/build-mod.ts` builds a folder into a package. Mods are trusted code (prompt, fingerprint, visible list), not sandboxed; see the ADR.

## Core runtime pieces (`@orbital/core`, plan 003)

Shipped by plan 003; plan 005 added the loader and extended the definition shapes.

- **Registries:** `createRegistry<T extends { id: string }>(kind, { schema? })` → `register(def, byPlugin)`, `get`, `has`, `list`, `entries`, `owner`. Ids must match `<plugin>.<name>` (lower-case kebab segments). A duplicate id throws `RegistryError` whose message names both plugins (`existingBy`, `attemptedBy` are also fields). When a zod `schema` is given, definitions are checked with `safeParse` and invalid ones throw `RegistryError` naming the plugin and the zod issues; the *original* object is stored. Definitions are deep-frozen on register (plain objects and arrays only; functions and class instances such as zod schemas are left alone). `createRegistries()` returns the five registries `parts`, `modules`, `resources`, `bodies`, `systems`; parts, resources and bodies are schema-validated (`src/schemas.ts`).
- **Definition shapes in core** (`src/definitions.ts`): `PartDefinition` is the *data* form, so its `modules` is a list of `[moduleId, config]` pairs with ids as strings. `definePart` (module objects) resolves to this form by replacing each module with its id. `ModuleDefinition<In, Out, State>` carries `id`, `config?` (zod), `requires?`, `state?`, and the hooks `onStage`, `update`, `updateOnRails`, `actions`, `snapshot`; `SystemDefinition` is `{ id, phase, update(world, dt, ctx) }` (all in `definitions.ts`).
- **Events:** `createEventBus<M = EventMap>()` → `on/once/off/emit`; `on`/`once` return an unsubscribe function. `EventMap` is an exported open interface that already contains `world:entity-added` and `world:entity-removed` (`{ id: EntityId }`); plugin events are added by module augmentation, and unknown names are compile errors (`test/types.test-d.ts`). Handlers run in subscription order; a handler throwing propagates to the emitter. SDK users augment `'@orbital/sdk'` (see above).
- **World:** see ADR 0010. `createWorld({ events? })`, `defineComponent<T>(name)` tokens, `createEntity/destroyEntity/add/get/has/remove/query`, `serialize()` → `WorldData`, `deserializeWorld(data: unknown)` (validated with zod).
- **Ids:** branded `EntityId`, `PluginId`, `PartId`, `ModuleId`, `ResourceId`, `BodyId`, `SystemId` with validating constructors (`partId('stock.engine-lv')`). Registry definitions use plain `string` ids; the brands are for code that handles ids.

## Patching (API 0.1.26, plan 079, ADRs 0104 and 0170)

`ctx.patches.register(definePatch({ id, target, select, ops, after?, before?, priority? }))` changes data another plugin registered, without replacing the entry. Targets are the data registries with a schema (`part`, `resource`, `body`, `building` since plan 090, `category` since plan 069); `module` and `system` hold functions and are not patchable. Code: `packages/core/src/patch.ts` (`applyPatches`, `orderPatches`), wired in `loadPlugins` step 5.

- **When.** Once per load: after every plugin booted, before the part/module cross-check (`partModuleProblems`). No runtime patching.
- **Order.** A graph over patches: `after`/`before` name plugins; then `priority` (lower first), boot index of the patching plugin, registration order. Strongly connected components (Tarjan) are cycles: their patches are disabled, the rest apply.
- **Apply.** Per patch: clone each selected entry (`clonePlain`), apply the ops, validate (`Registry.validate`, plus the module configs of a patched part), and only if every entry passes swap them in with the loader-only `replaceDefinition` (frozen again). Otherwise the patch is disabled with a reason; nothing changes. Paths are dot-separated; under a part's `modules` the segment after `modules` is a module id, matched by the longest run of segments.
- **Report.** `LoadReport.patches` (apply order; `applied`, `changes` with `from`/`to`, `disabled`) and `LoadReport.provenance[kind][entryId][path]` (registering plugin, then patchers). The web mod runtime keeps `patches` for the booted set and `/mods` shows them per mod (`apps/web/src/lib/mods/ModPatches.svelte`).
- **Cost.** 1 000 patches over the stock registries: under 50 ms on the M5 (benchmark in `mods/stock/test/patch-bench.test.ts`).

## World rules and presets (API 0.1.27, plan 078, ADR 0111)

`ctx.rules.register(defineRule(...))` and `ctx.presets.register(definePreset(...))` fill the registries `rules` and `presets` (report kinds `rule`, `preset`). Types and pure helpers are in `packages/core/src/rules.ts`: `ruleDefinitionSchema` (a default and every `presets` value must fit the type), `presetDefinitionSchema`, `ruleValueProblem`, `presetValue`, `resolveRules`. After boot, `loadPlugins` checks each preset's `values` against the rules that are loaded and throws a `PluginError` listing the misfits; a value for a rule that is not loaded is ignored.

The values belong to the world, not to the registry: `WorldInfo.rules` in `SimSave.worldInfo` (format 5), with `preset` and `changelog` beside them. `createSim` completes the map with `resolveRules` (own value, preset `values`, rule `presets[preset]`, `default`), keeps ids no loaded rule defines (`Sim.unknownRules`) and refuses values of the wrong type. Systems get `SystemContext.rules.get(id)`; snapshots carry `rules` (rebuilt only after a change). `set-rule` is handled in `packages/sim/src/commands.ts` (`setRule`): identity names (`IDENTITY_RULES`) and `changeable: false` rules are refused with `identity rule`; an accepted change is written at dispatch, logged and emitted as `world:rule-changed`.

## Economy data (API 0.1.30, plan 095, ADR 0113)

`PartDefinition.cost` and `ResourceDefinition.price` are optional schema fields; `ctx.charges` fills the `charges` registry (report kind `charge`, `chargeDefinitionSchema`). The pure functions are in `packages/core/src/economy.ts`: `designCost` (part costs plus the initial contents found through each module's `store` and `state(config)`), `contentsValue`, `chargeOn`, `projectBalances`, `recoveryFactor`, `recoveryQuote`. The sim reads the rule ids in `ECONOMY_RULES` and writes its own causes from `ECONOMY_CAUSES`.

## Buildings (API 0.1.36, plan 090, ADR 0115)

`ctx.buildings` fills the `buildings` registry (`buildingDefinitionSchema`; report kind `building`; patch target `building`). `packages/core/src/buildings.ts` holds the grid (10 m cells centred on multiples of 10 m, east and north of the site centre), `footprint`, `entranceFronts`, `canPlace` with its reasons, `pathToRoad` (BFS over free cells) and `LEGACY_LAYOUT`, today's launch site on the grid, which `LEGACY_SITE` carries. It does not import `schemas.ts` (that module imports `sites.ts`, which imports this one).

## Per-part settings, shells and debris (API 0.1.81, plan 219, ADR 0224)

A design part may carry `settings` by module id; the fields merge over the definition's module config and the module's schema parses the result at load. Three optional module hooks: `mass(config, state)` adds kg to the part, `shell(config, state)` returns a closed profile (`{ y, r }` bottom to top) whose enclosed parts take no drag or convective heat, and `VesselApi.spawnDebris({ part, settings, offset, velocity })` throws a one-part vessel off (its mass must leave through `mass`). `PartVisual.paramsFrom` names the module whose config becomes the generator's params per part. Stock `stock.fairing` config: `size` (base diameter), `sections` (`{ height, radius }[]`), `closed`, `arealDensity` (kg/m², default 4), `ejectionImpulse` (N·s per panel, default 300), `baseTop`.

## Build-time controls and Hangar data (API 0.1.83, plan 218, ADR 0225)

A part action descriptor may name the config field its value sets in the Hangar: `build: 'limiter'` or a path such as `['contents', resource, 'amount']`. The Hangar draws those controls with the flight inspector's rows and writes the value into the design part's `settings` for that module (the top field whole, with the value placed inside), for the whole symmetry group unless "Only this part". The module's `state(config)` must start from the field, so the part flies as built. `buildOnly: true` marks a Hangar-only control (a tank's fill): flight panels skip it, and it needs no action. A trigger takes no `build`. Core exports `withSettings(base, own)` (the merge the sim spawns with) and `settingsWith(base, own, path, value)`.

Stock fields: engine `limiter` and `gimbalLimit` (0..1, default 1), docking port `crossfeed` (default true), the parachute's `mode`, `minPressure` and `deployHeight`, a container's `contents.<resource>.amount`.

`VesselDesign.crew` (`{ member, part }[]`, optional) is the Hangar's seating; the Launch screen starts from it and the sim ignores it. The design's custom `groups` are edited in the Hangar, and the editor drops members and seats on parts it no longer holds.

## Building categories and the build menu (API 0.1.84, plan 235, ADR 0227)

`CategoryDefinition.scope` (`'parts'` when absent, or `'buildings'`) splits the one category registry between the Hangar's rail and the Space Center's build menu. `BuildingDefinition.category` names a buildings-scope category and `description` gives its card a line; `buildingCategoryOf` sends anything else to `stock.other-buildings`. The renderer's `createBuildingThumbnails()` draws a building generator once per session into a 256 × 160 picture (one offscreen renderer, released when its queue is empty).

## Branch space centers (API 0.1.87, plan 236, ADR 0229)

`SITE_KINDS` gains `branch`; the command `found-branch` founds one on the home body; the site placement gains `at: { east, north }` for a spot instead of a pad index; `BRANCH_HQ`, `branchHqOf` and `hqReady` are core helpers and `PlacementSite.branch` makes `canPlace` wait for the HQ. A building providing `branch-hq` sets the founding cost and time.

## Abort group and trim axes (API 0.1.90, plan 245, ADR 0233)

`ABORT_SLOT` (0) is the design's Abort group: a custom group at slot 0, group id `custom.0`, fired by Backspace in flight after the throttle is cut. The design's slot range is 0–10. The `trim` command takes `pitch`, `yaw` and `roll`, each optional (an omitted axis keeps its value, 0 clears it), and the vessel snapshot carries `trim` while any axis is not zero.

## Splashed (API 0.1.91, plan 246, ADR 0236)

`VesselSnapshot.splashed` is `true` while the vessel rests on water (the sim's `stock.splashed` situation) and absent otherwise.

## Breathable air (API 0.1.92, plan 249, ADR 0237)

`atmosphere.breathable` (optional boolean, off unless `true`) says a suited crew member may take the helmet off in that air; `Ambient.breathable` carries it to module hooks. `stock.helmet` is the suit's helmet module and `helmetMayComeOff` its rule.

## Interstage nodes (API 0.1.93, plan 243, ADR 0238)

An attach node may carry `shellTop: "<module id>"`: it sits at the top of that module's shell (`baseTop` plus the section heights, as wide as the last section) and exists only while the module's per-part `interstage` setting is on. `effectiveDef(def, settings)` gives the definition as one design entry has it; `resolveVesselDesign` and the Hangar use it. The fairing's `interstage` setting (and a shell that shields while open at the top) is `stock.fairing`'s.

## Lamps (API 0.1.94, plan 242, ADR 0239)

`PartVisual.lamp` (`module`, `pos`, `dir`, optional `angle` in degrees and `range` in metres) marks a part as a lamp: while that module's snapshot says `on`, the part shows a lit lens at `pos` in the snapshot's `colour` (hex) and `brightness`, blinking if `blink`; the scene gives the nearest few a spot light. `stock.light` is the stock module.

## Capsule stability (API 0.1.95, plan 265, ADR 0246)

`PartDefinition.centerOfMass` (optional, part frame, m) is where the part's mass sits, offset from its shape's centre; the sim's mass properties, the snapshot's centre of mass and the Hangar's stability line use it, while drag, colliders and attachments stay on the shape's centre. `PartDefinition.bluntBase` (optional) is the moment coefficient of a blunt -Y end on a cylinder part: while that end is open to the wind the airflow turns the part base first.

## Design format 4: part offset (API 0.1.97, plan 279, ADR 0258)

`VesselDesign.formatVersion` 4 adds `parts[i].offset` (`{x, y, z}`, metres in the parent part's axes, applied after the attach transform and before the tilt; children move with the part; the root ignores it) and `freePlacement: true` (the Hangar's free mode; the sim ignores it). `migrateVesselDesign` turns versions 1 to 3 into 4 unchanged (`DESIGN_FORMAT_VERSION`). `resolveVesselDesign` applies the offset (`withOffset`), so the sim's colliders, mass and centre of mass, the Δv read-out and drag see the moved part. Tilts take any angle; `tiltOfMatrix` inverts `tiltMatrix`.

## Robotic joints (API 0.1.98, plan 306, ADR 0269)

`ModuleDefinition.joint(config, state)` makes a module a robotic joint. It returns `{ kind: 'rotate' | 'translate', axis, pivot, node, value }` (part frame; `value` in rad or m), or null. The module moves `value` itself (its `update`). The sim turns or slides the parts reached through `node` by the change since the pose it applied last, which it keeps as `applied` (a number) in the module state. Then it rebuilds the vessel's body, at most every 0.1 s. Every joint is kinematic: no physics joint, no reaction on the vessel. `PartVisual.articulation` gains the modes `spin` (about Y, rad) and `slide` (up Y, m) for the part's moving half. `stock.robotic` is the stock example.

## Non-TypeScript mods

JSON data files (`part.json`, `resource.json`) that reference module ids by string are accepted and validated with the same zod schemas. Same registry, no second system.
