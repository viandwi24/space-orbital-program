# Plugin system

The design target: a modder adds a working engine with one TypeScript file, fully typed, with no change to core. Stock content is built the same way (ADR 0005). This document is the design; plan 005 implements it and must update this doc with what actually shipped.

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
export default definePlugin({
  meta: { id: "acme.nuclear", version: "1.0.0", api: "^0.1" },
  depends: [Stock],                 // plugin *instances* → types flow into ctx
  optional: [LifeSupport],          // soft deps; ctx.optional.lifeSupport?: ...
  contributes: {} as {
    nuclear: { reactorTemp(part: PartId): number };
  },
  setup(ctx) {
    ctx.resources.register(Uranium);
    ctx.modules.register(ModuleReactor);
    ctx.parts.register(PartNerva);
    ctx.events.on("vessel:stage", (e) => { /* typed */ });
    ctx.provide("nuclear", { reactorTemp });
  },
});
```

- `depends` takes plugin instances, not strings, so TypeScript merges each dependency's `contributes` into `ctx`. String ids are accepted for loosely coupled runtime deps (no types).
- `contributes` declares the typed API this plugin exposes to dependents; `ctx.provide` supplies the implementation. A plugin may contribute types only (no-op setup) and let a host inject the implementation — useful for test doubles.
- Loader: topological sort (Kahn). Circular dependency → error naming the cycle. Missing hard dependency → plugin disabled with a reason. Version mismatch of `api` → refused with a clear message.

### `defineModule`

```ts
export const ModuleEngine = defineModule({
  id: "stock.engine",
  config: z.object({ thrust: z.number(), isp: z.number(), propellants: z.array(z.string()) }),
  state: () => ({ throttle: 0, ignited: false }),   // serializable; no methods
  requires: ["stock.resource-consumer"],            // other modules on the same part
  onStage(ctx) { ctx.state.ignited = true; },
  update(ctx, dt) { /* apply thrust via ctx.physics.applyForce(...) */ },
  actions: { toggle: (ctx) => { ctx.state.ignited = !ctx.state.ignited; } },
  snapshot: (state) => ({ throttle: state.throttle }),   // what UI sees
});
```

- `config` is a zod schema. Part definitions are type-checked against it at compile time and validated at load time.
- `state` is created per part instance and lives in the world as a component. Functions live on the definition.
- `update` runs every fixed step while the owning vessel is in flight mode. On rails, modules get `updateOnRails(ctx, dt)` if they define it (e.g. resource generation).
- `actions` are callable from UI, staging, and scripts.

### `definePart`

```ts
export const PartEngineLV = definePart({
  id: "stock.engine-lv",
  title: "LV-T30 Liquid Engine",
  mass: 1250,
  mesh: "models/engine-lv.glb",
  attach: { top: { pos: [0, 0.6, 0], dir: [0, 1, 0] }, bottom: { pos: [0, -0.6, 0], dir: [0, -1, 0] } },
  modules: [
    [ModuleEngine, { thrust: 215_000, isp: 300, propellants: ["stock.liquid-fuel", "stock.oxidizer"] }],
  ],
  stagingIcon: "engine",
});
```

Config literals are checked against the module's zod schema type. A part is pure data; it has no functions.

### `defineResource`, `defineBody`, `defineSystem`

- `defineResource({ id, density, flowMode: "stack" | "vessel" | "none", unit })`
- `defineBody({ id, mass, radius, rotationPeriod, atmosphere?: { scaleHeight, surfacePressure, height }, parent?, orbit? })`
- `defineSystem({ id, phase: "pre-physics" | "post-physics", update(world, dt) })`

## Type sharing between plugins

1. **`depends` → `contributes`:** typed API injected into `ctx` (above).
2. **Plain exports:** a plugin is a package; `import { ModuleEngine, type EngineConfig } from "@orbital/mod-stock"` works. External mods use `@orbital/sdk` as a `peerDependency` so there is one copy of the types.
3. **Module augmentation** for open registries:

```ts
declare module "@orbital/sdk" {
  interface ResourceMap { "acme.uranium": { density: number } }
  interface EventMap    { "reactor:meltdown": { part: PartId } }
}
```

   After this, `ctx.events.on("reactor:meltdown", e => e.part)` is typed in any plugin that depends on `acme.nuclear`.

## Loading

- In-repo plugins are imported statically and passed to the loader.
- External mods (Phase 2) are loaded with dynamic `import()` from a URL or folder, validated (manifest, `api` range, schemas), then booted in dependency order.
- The loader produces a **manifest report**: what was registered, by whom, and any conflicts (same id registered twice → error naming both plugins).

## Patching (Phase 2)

A plugin may declare `patches` that modify parts of other plugins (add a module, change a number). Patches apply after all registrations, in load order, and are reported. Modelled on KSP's ModuleManager, but typed.

## Non-TypeScript mods

JSON data files (`part.json`, `resource.json`) that reference module ids by string are accepted and validated with the same zod schemas. Same registry, no second system.
