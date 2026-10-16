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

`flowMode` tells the sim how far the resource may travel: `stack` from tanks connected to the consumer (not through a part with `crossfeed: false`, such as an engine or decoupler), `vessel` from anywhere on the vessel (electric charge), `none` not at all.

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

A hook reads `ctx.config`, mutates `ctx.state`, emits on `ctx.events` and acts on its vessel through `ctx.vessel` (ADR 0015). Stock's engine, in short:

```ts
update(ctx, dt) {
	const { state, config, vessel } = ctx;
	state.throttle = vessel.control.throttle;
	if (!state.ignited) return;
	const out = engineOutput(config, state, vessel.ambient.pressure);   // pure helper
	// ...draw propellants with vessel.resources.withdraw(resource, amount)...
	vessel.applyForce({ x: 0, y: out.thrust, z: 0 });                   // along the part's local +Y
}
```

- `vessel.applyForce(force, point?)` / `applyTorque(torque)`: part-local frame, current step only, flight mode only. `vessel.resources.amount/withdraw/deposit(resource, n)`: what is reachable from this part (`flowMode`, and parts with `crossfeed: false` block `stack` flow). `vessel.detach(node, impulse)`: sever an attach node (stock decoupler). `vessel.control` (throttle, pitch/roll/yaw demand) and `vessel.ambient` (pressure, density, altitude) are read-only.
- A module that holds resources declares `store: { resources, amount, withdraw, deposit }` (stock's container does) so the sim can sum its mass and route flow without knowing it; a module that makes a vessel controllable sets `controlSource: true` (stock's command module).
- `updateOnRails(ctx, dt)` may use resources but not forces; `dt` can be up to 10 s.
- **The module owns the schema, the state and the pure arithmetic** (`engineOutput`, `withdraw`, `deposit`), so tests can exercise it without a sim.
- Actions take `unknown` arguments: validate them (stock uses `z.tuple([...]).parse(args)`).
- `absorbHeat(ctx, { power, temperature }, dt)` (ADR 0023) is called each flight step in which the airflow puts `power` W on the part, before its skin warms; return the watts you carry away (clamped to `0..power`) and change `ctx.state` accordingly. Stock's heat shield burns `power·dt / heatOfAblation` kg of its `stock.ablator` once its skin is above `ablationTemperature`, and declares a `store` for the ablator so its mass counts.
- `colliders(config, state)` adds collision boxes to the part for the current state (stock's landing leg returns four feet when `state.deployed`, none when retracted). It must be a pure function of config and state; the vessel body is rebuilt after a dispatched action or stage changes it.
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
- `impactTolerance` (m/s, optional, default 6): ground impact speed above which the part breaks off the vessel; above twice it, the part is destroyed. The sim reports both as the `part:damaged` event (`{ vessel, part, definition, speed, outcome, cause: 'impact' }`). Stock: pod 10, tanks 5, engine 4, legs 12.
- `maxTemperature` (K, optional, default 1000): skin temperature above which re-entry heating destroys the part (`part:damaged` with `cause: 'overheat'` and `temperature`). Stock: tanks 900, pod/wheel/decoupler/legs 1000, engine 1800, heat shield 3000. Parts carry a `temperature` in the snapshot.
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

`loadPlugins` validates schemas and cross-checks every part's module configs, so bad data fails the boot with the part and module named. To unit-test a hook, build a `ModuleContext` from `createWorld()` and `createEventBus()` (both exported by the SDK for this), the loaded `registries`, the module's parsed config, `module.state(config)` and a recording `vessel` stub; see `mods/stock/test/helpers.ts` (`fakeVessel`). To test with a real sim, `@orbital/sim`'s `createSim({ plugins: [Stock, YourMod], backendFactory })` is a test dependency, not something a mod imports in `src`.

## Open items

- `defineSystem` (per-step logic over the world, phases `pre-physics`/`post-physics`) is supported by the sim but has no stock example yet; this guide will gain a section when one exists.
- Loading external mods from a folder or URL is Phase 2.
