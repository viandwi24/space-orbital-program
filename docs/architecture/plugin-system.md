# Plugin system

A modder adds a working engine with one TypeScript file, fully typed, with no change to core. Stock content is built the same way (ADR 0005). This document describes the API as shipped by plan 005 (`API_VERSION` 0.1.2; decisions in ADR 0013, 0014 and 0015). Code lives in `packages/sdk/src/define.ts` (define functions, inference types) and `packages/core/src/{plugin,definitions,semver}.ts` (loader, runtime shapes).

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
- Hook context (`ModuleContext`): `{ world, events, registries (read-only), physics, entity, config, state, vessel }`; `vessel` is the capability API below. `update` runs every fixed step in flight mode; `updateOnRails(ctx, dt)` on rails (must not use `physics`); `onStage(ctx)` when the part's stage fires; `actions` are callable from UI, staging and scripts; `snapshot(state)` returns JSON for the UI.
- Hooks are typed with a parameter-bivariant function type, which is what lets a typed definition be stored in the erased registry without casts.

#### The vessel capability API (`ctx.vessel`, ADR 0015, plan 007)

```ts
update(ctx, dt) {
  const { control, ambient, resources } = ctx.vessel;       // throttle/pitch/roll/yaw; pressure/density/altitude
  ctx.vessel.applyForce({ x: 0, y: thrust, z: 0 });          // part-local frame, this step only, flight only
  ctx.vessel.applyTorque({ x: 0, y: 0, z: torque });
  const got = resources.withdraw('stock.liquid-fuel', 0.1);  // reachable per flowMode / crossfeed; amount() and deposit() too
  ctx.vessel.detach('top', 2_000);                           // sever the attachment at a node; impulse N·s
}
```

Forces and torques throw on rails (`updateOnRails` must not use them). Control demand axes: pitch about +X, roll about +Y (the stack axis), yaw about +Z. Two more optional module fields let the sim stay generic: `store` (`resources/amount/withdraw/deposit`: this module holds resources, so the sim sums its mass and routes flow through it) and `controlSource: true` (the part makes the vessel controllable). `PartDefinition.crossfeed?: boolean` (default true) says whether resources may flow through the part. Events `vessel:mode-changed`, `vessel:created`, `vessel:destroyed`, `stage:activated` are in core's `EventMap`.

### `definePart`

```ts
export const PartEngineLV = definePart({
  id: 'stock.engine-lv',
  title: 'LV-T30 Liquid Engine',
  mass: 1250,
  mesh: 'models/engine-lv.glb',
  shape: { kind: 'cylinder', radius: 0.625, height: 1.2 },   // placeholder geometry, metres (ADR 0014)
  attach: { top: { pos: [0, 0.6, 0], dir: [0, 1, 0] }, bottom: { pos: [0, -0.6, 0], dir: [0, -1, 0] } },
  modules: [
    [ModuleEngine, { thrust: 215_000, propellants: ['stock.liquid-fuel', 'stock.oxidizer'] }],
    [ModuleCommand],                                // config-less module: [module] (or [module, undefined])
  ],
  stagingIcon: 'engine',
});
```

Config literals are checked against the module's schema input type (wrong type, missing required key, unknown key, config given to a config-less module are compile errors). `definePart` returns core's plain-data `PartDefinition`: each module object becomes `[module.id, config]`, config stored as written. String-id entries are accepted when the id is in `ModuleMap` (see augmentation), and a JSON part (`{ "modules": [["acme.reactor", { ... }]] }`) is the same shape; it is validated with `partDefinitionSchema` and then by the loader against the module's schema exactly like a TypeScript part. A part is pure data; it has no functions. `shape` (`{ kind: 'box', size: [x, y, z] }` or `{ kind: 'cylinder', radius, height }`, metres, cylinder axis = local Y) is the placeholder geometry used by the renderer and the physics body until art exists.

### `defineResource`, `defineBody`, `defineSystem`

- `defineResource({ id, density, flowMode: 'stack' | 'vessel' | 'none', unit })`
- `defineBody({ id, mass, radius, rotationPeriod, atmosphere?: { scaleHeight, surfacePressure, height }, parent?, orbit? })`
- `defineSystem({ id, phase: 'pre-physics' | 'post-physics', update(world, dt, ctx) })`: `ctx` is `{ registries (read-only), events }`; extra parameters may be omitted.
- All three are typed identity functions; the registry validates them with zod (`schemas.ts`) on register.

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
- External mods (Phase 2) are loaded with dynamic `import()` from a URL or folder, validated (manifest, `api` range, schemas), then booted in dependency order.
- The loader produces a **report** (see above): boot order, disabled plugins with reasons, what was registered and by whom. A same-id conflict between plugins is a `RegistryError` naming both.

## Core runtime pieces (`@orbital/core`, plan 003)

Shipped by plan 003; plan 005 added the loader and extended the definition shapes.

- **Registries:** `createRegistry<T extends { id: string }>(kind, { schema? })` → `register(def, byPlugin)`, `get`, `has`, `list`, `entries`, `owner`. Ids must match `<plugin>.<name>` (lower-case kebab segments). A duplicate id throws `RegistryError` whose message names both plugins (`existingBy`, `attemptedBy` are also fields). When a zod `schema` is given, definitions are checked with `safeParse` and invalid ones throw `RegistryError` naming the plugin and the zod issues; the *original* object is stored. Definitions are deep-frozen on register (plain objects and arrays only; functions and class instances such as zod schemas are left alone). `createRegistries()` returns the five registries `parts`, `modules`, `resources`, `bodies`, `systems`; parts, resources and bodies are schema-validated (`src/schemas.ts`).
- **Definition shapes in core** (`src/definitions.ts`): `PartDefinition` is the *data* form, so its `modules` is a list of `[moduleId, config]` pairs with ids as strings. `definePart` (module objects) resolves to this form by replacing each module with its id. `ModuleDefinition<In, Out, State>` carries `id`, `config?` (zod), `requires?`, `state?`, and the hooks `onStage`, `update`, `updateOnRails`, `actions`, `snapshot`; `SystemDefinition` is `{ id, phase, update(world, dt, ctx) }` (all in `definitions.ts`).
- **Events:** `createEventBus<M = EventMap>()` → `on/once/off/emit`; `on`/`once` return an unsubscribe function. `EventMap` is an exported open interface that already contains `world:entity-added` and `world:entity-removed` (`{ id: EntityId }`); plugin events are added by module augmentation, and unknown names are compile errors (`test/types.test-d.ts`). Handlers run in subscription order; a handler throwing propagates to the emitter. SDK users augment `'@orbital/sdk'` (see above).
- **World:** see ADR 0010. `createWorld({ events? })`, `defineComponent<T>(name)` tokens, `createEntity/destroyEntity/add/get/has/remove/query`, `serialize()` → `WorldData`, `deserializeWorld(data: unknown)` (validated with zod).
- **Ids:** branded `EntityId`, `PluginId`, `PartId`, `ModuleId`, `ResourceId`, `BodyId`, `SystemId` with validating constructors (`partId('stock.engine-lv')`). Registry definitions use plain `string` ids; the brands are for code that handles ids.

## Patching (Phase 2)

A plugin may declare `patches` that modify parts of other plugins (add a module, change a number). Patches apply after all registrations, in load order, and are reported. Modelled on KSP's ModuleManager, but typed.

## Non-TypeScript mods

JSON data files (`part.json`, `resource.json`) that reference module ids by string are accepted and validated with the same zod schemas. Same registry, no second system.
