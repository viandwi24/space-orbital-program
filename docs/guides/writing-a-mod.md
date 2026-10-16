# Writing a mod

First draft, written from `mods/stock`, which is built with exactly the API a third party gets. Read it next to the code: every snippet below is a trimmed copy of a file you can open. API reference and rationale: `architecture/plugin-system.md`, ADR 0013 and 0014.

## Ground rules

- Import **only** from `@orbital/sdk` (declare it as a `peerDependency` in an external mod so there is one copy of the types). No `@orbital/core`, `sim`, `physics`, `renderer`, no DOM, no `Bun.*`/`process.*`.
- Everything is SI: metres, kilograms, seconds, newtons, radians. Helpers like `kN(215)`, `km(600)`, `tonnes(2)` exist for readability at definition sites and return plain numbers.
- Ids are `<plugin>.<name>` in lower-case kebab-case (`stock.engine-lv`). Your plugin id is the prefix; a duplicate id is a load error that names both plugins.
- A definition is data. State is plain serializable data held by the sim; behaviour is functions on the module definition.

## File layout (as in stock)

```
my-mod/src/
  resources.ts   defineResource
  modules.ts     defineModule (+ pure helpers)
  parts.ts       definePart
  bodies.ts      defineBody
  index.ts       definePlugin that registers all of it
```

## 1. Resources

```ts
export const LiquidFuel = defineResource({
	id: 'stock.liquid-fuel',
	density: 5, // kg per unit; must be > 0
	flowMode: 'stack', // 'stack' | 'vessel' | 'none'
	unit: 'u'
});
```

`flowMode` tells the sim how far the resource may travel: `stack` from tanks connected towards the consumer, `vessel` from anywhere on the vessel (electric charge), `none` not at all.

## 2. Modules

A module has a zod config schema (`z` is re-exported by the SDK), serializable state, and hooks. Parts are type-checked against the schema's **input** type; hooks see the parsed **output** (defaults applied).

```ts
export const ModuleDecoupler = defineModule({
	id: 'stock.decoupler',
	config: z.object({
		separates: z.enum(['top', 'bottom']).default('top'),
		ejectionImpulse: z.number().nonnegative().default(2_000) // N·s
	}),
	state: () => ({ decoupled: false }), // receives the parsed config if you need it
	onStage(ctx) {
		ctx.state.decoupled = true;
	},
	actions: { decouple: (ctx) => { ctx.state.decoupled = true; } },
	snapshot: (state) => ({ decoupled: state.decoupled }) // what the UI sees
});
```

What a hook may do today: read `ctx.config`, mutate `ctx.state`, emit on `ctx.events`. `ctx.physics` exists, but a hook has no body handle for its part and no access to other parts' state, so effects that cross parts or reach the physics backend are applied by the sim. The stock convention, which is what to follow until the sim publishes a richer context:

- **The module owns the schema, the state and the pure arithmetic** (`engineOutput(config, state, pressure)` returns thrust and mass flow; `withdraw`/`deposit` move resource amounts).
- **The sim reads config and state each step and applies the effect** (thrust force, propellant flow through the containers, splitting the vessel when `decoupled` flips, wheel torque).
- Actions take `unknown` arguments: validate them (stock uses `z.tuple([...]).parse(args)`).
- Modules that need a sibling on the same part declare `requires: ['stock.resource-container']`; the loader checks it.

Pure helpers other mods can reuse are exposed to dependents through `contributes`:

```ts
export const Stock = definePlugin({
	meta: { id: 'stock', version: '0.1.0', api: '^0.1' },
	contributes: {} as { stock: typeof stockApi }, // type-only declaration
	setup(ctx) {
		/* register things */
		ctx.provide('stock', stockApi); // the implementation, once
	}
});
// in another mod:  definePlugin({ depends: [Stock], setup(ctx) { ctx.stock.engineOutput(...) } })
```

## 3. Parts

```ts
export const PartEngineLV = definePart({
	id: 'stock.engine-lv',
	title: 'LV-T30 Liquid Engine',
	mass: kg(1_250),
	shape: { kind: 'cylinder', radius: 0.625, height: 1.2 }, // placeholder geometry, metres
	attach: {
		top: { pos: [0, 0.6, 0], dir: [0, 1, 0] },
		bottom: { pos: [0, -0.6, 0], dir: [0, -1, 0] }
	},
	modules: [
		[
			ModuleEngine,
			{
				thrust: 215_000, // vacuum thrust, N
				ispVacuum: 300,
				ispSeaLevel: 280,
				propellants: [
					{ resource: 'stock.liquid-fuel', ratio: 0.9 }, // relative volume
					{ resource: 'stock.oxidizer', ratio: 1.1 }
				]
			}
		]
	],
	stagingIcon: 'engine'
});
```

- `modules` entries are `[moduleObject, config]`, or `[moduleObject]` for a module without config. A wrong type, a missing key or an unknown key is a compile error.
- `shape` is `{ kind: 'box', size: [x, y, z] }` or `{ kind: 'cylinder', radius, height }`, centred on the part origin with the cylinder along local Y. Until real meshes exist the renderer and the physics body use it.
- Attach nodes: stack parts have `top` (+Y) and `bottom` (-Y) on the axis, `dir` pointing away from the part.
- A part is plain data, so the same thing written as JSON (`modules: [["stock.engine", {...}]]`) is accepted and validated the same way.

## 4. Bodies

```ts
export const HomeBody = defineBody({
	id: 'stock.home',
	mass: 3.5316e12 / 6.6743e-11, // from mu = G·M
	radius: km(600),
	rotationPeriod: 21_600,
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: km(70) }
});
```

A body with no `parent`/`orbit` is a root body. Gravity is point-mass; the atmosphere is exponential.

## 5. The plugin

`definePlugin({ meta: { id, version, api: '^0.1' }, depends, optional, contributes, setup(ctx) })`. `setup` is synchronous and registers with `ctx.resources/modules/parts/bodies/systems.register(def)`. `api` is a range on the mod API version; a mismatch disables your plugin with a reason in the load report.

## 6. Testing a mod

```ts
import { loadPlugins } from '@orbital/sdk';
const { registries, report } = loadPlugins([Stock]);
expect(report.registered.part.map((e) => e.id)).toContain('stock.engine-lv');
```

`loadPlugins` validates schemas and cross-checks every part's module configs, so bad data fails the boot with the part and module named. To unit-test a hook, build a `ModuleContext` from `createWorld()` and `createEventBus()` (both exported by the SDK for this), the loaded `registries`, the module's parsed config and `module.state(config)`; see `mods/stock/test/helpers.ts`. Keep the physics backend out of module tests.

## Open items

- Systems (`defineSystem`) and the module context the sim will provide (body handle, vessel resources) arrive with plan 007; this guide will gain a section then.
- Loading external mods from a folder or URL is Phase 2.
