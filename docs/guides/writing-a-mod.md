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
- **Lifting surfaces** (API 0.1.8, ADR 0035): `vessel.airVelocity(point?)` gives the velocity of a part-frame point relative to the air, in the part frame, including the vessel's rotation; with `vessel.ambient.density` and `applyForce(force, point)` a module can make lift, drag or steering. Stock's `stock.fin` (`finNormalForce` in `mods/stock/src/modules.ts`) is a flat plate whose normal force is `-1/2 rho V² S (liftSlope sin a cos a + crossflow sin a |sin a|)`; the fin part sets `shape` as a thin box, a horizontal `radial` node (`dir [-1, 0, 0]`) and the module config. A part is placed radially in the VAB when it has such a node; give a booster-style part a `top` node and a `radial` node and a decoupler an `outer` node, as `stock.radial-decoupler` and `stock.booster` do (`separates: 'radial'`).
- **Steering parts** (API 0.1.10, ADR 0045): `vessel.centreOfMass` (part frame, flight only) and `vessel.torqueDemand` (the attitude demand as a torque direction in the part frame) are what an actuator needs. Do not invent a mapping: `mods/stock/src/steering.ts` has the one rule stock uses (`mixFraction`: demand fraction = deflection fraction, the sign follows the lever arm, less authority within 1 m of the centre of mass, `gimbalTarget`, `surfaceTarget`, `slew`). `stock.engine` takes `gimbal: { range: degrees, rate: degrees per second }` (default none; the stock LV-T30 has 3 and 20) and publishes `gimbal: [towardX, towardZ]` rad in its snapshot; `stock.control-surface` is a fin (`area`, `liftSlope`, `crossflow`, `centre`, `damping`) with `maxDeflection` and `deflectionRate` that publishes `deflection`. Fins and control surfaces take `damping` (default 60, ADR 0046): extra damping of the rotational airflow, `0` for the plain plate. To show a moving piece, give the part visual `articulation: { module, field, mode: 'gimbal' | 'hinge' }` and a renderer generator that puts the moving geometry in `ctx.moving` and returns `{ pivot }`; the engine bell and the control-surface plate are built that way.
- **Asset models** (ADR 0047): a part visual `{ kind: 'model', params: { url, fallbackKind } }` is loaded by `GltfPartProvider` (put it first in `partProviders` and `await factory.preload(ids)`); if the file cannot be loaded the generator named by `fallbackKind` (or the shape) builds the part. Parts made from assets show no plume or articulation yet.
- **Control authority** (API 0.1.11, ADR 0049, plan 042): a steering module may define `controlAuthority(ctx): Vec3`, the largest torque in N·m it can add about each part axis (x pitch, y roll, z yaw, all >= 0) right now, zero when it cannot steer (a cold engine, an unpowered wheel, a control surface in vacuum). The stability assist divides the vessel's sum by its inertia to size its demand, so a part with this hook is steered by SAS like stock's; without it SAS ignores the part. Helpers: `gimbalAuthority`, `surfaceAuthority` in `mods/stock/src/steering.ts`.
- `updateOnRails(ctx, dt)` may use resources but not forces; `dt` can be up to 10 s.
- **The module owns the schema, the state and the pure arithmetic** (`engineOutput`, `withdraw`, `deposit`), so tests can exercise it without a sim.
- Actions take `unknown` arguments: validate them (stock uses `z.tuple([...]).parse(args)`).
- `absorbHeat(ctx, { power, temperature }, dt)` (ADR 0023) is called each flight step in which the airflow puts `power` W on the part, before its skin warms; return the watts you carry away (clamped to `0..power`) and change `ctx.state` accordingly. Stock's heat shield burns `power·dt / heatOfAblation` kg of its `stock.ablator` once its skin is above `ablationTemperature`, and declares a `store` for the ablator so its mass counts.
- `colliders(config, state)` adds collision boxes to the part for the current state (stock's landing leg returns four feet when `state.deployed`, none when retracted). It must be a pure function of config and state; the vessel body is rebuilt after a dispatched action or stage changes it.
- **Describe your engines and separators for tools** (API 0.1.7, ADR 0033). The sim runs your hooks, but the HUD's and the VAB's stage delta-v, the VAB's auto-staging and its part card predict a burn without running it, so they ask the module what it is: `describe(config, state)` returns `{ engine?, separator? }`. An engine gives `massFlow` (kg/s at full throttle), a `thrust` curve (`[{ pressure: 0, thrust: vacuumN }, { pressure: 101325, thrust: seaLevelN }]`: ascending Pa, first point at vacuum, linear between points), `propellants` (`{ resource, ratio }` by volume) and `ignited` / `flameout` from the state. A separator gives the `node` it severs and `done` once fired. Stores need nothing extra: `store` already says what a tank holds. `describe` is pure; for a live vessel `state` is your `snapshot` view, so read only fields `snapshot` returns. The result is validated (`moduleInfoSchema`, exported by the SDK) and an invalid one fails with your module id. Without `describe` a mod's engine contributes 0 m/s and is not auto-staged. Stock's `stock.engine` and `stock.decoupler` do exactly this (`mods/stock/src/modules.ts`); `apps/web/src/lib/delta-v-mod.test.ts` is a complete third-party example (own resource, engine, separator) checked against Tsiolkovsky by hand.
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
	shape: { kind: 'cylinder', radius: 0.625, height: 1.2 }, // physics and heating geometry, metres
	visual: {
		kind: 'engine', // which renderer generator draws it
		palette: { primary: '#2d3138', secondary: '#9aa1aa', accent: '#b0642e' },
		plume: { module: 'stock.engine', nozzle: [0, -0.6, 0], exitRadius: 0.46, length: 7, exitPressure: 90_000 }
	},
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
- `shape` is `{ kind: 'box', size: [x, y, z] }` or `{ kind: 'cylinder', radius, height }`, centred on the part origin with the cylinder along local Y. The physics body and the heating model use it; the renderer draws it when a part has no `visual`.
- `visual` (optional, API 0.1.6, ADR 0028) is what the part looks like. `kind` names a procedural generator in the renderer: `capsule`, `tank`, `engine`, `decoupler`, `reaction-wheel`, `landing-legs`, `heat-shield` (the stock ones) or `plain` (a painted barrel from `shape` and `palette`). `palette` gives `primary`, `secondary` and `accent` paint as `#rrggbb`; `params` is a flat record of numbers read by the generator (for example tanks read `stripe` and `bands`, the legs read `spread`, `drop` and `footSize`; unknown keys are ignored and values are clamped). A part without a `visual`, or with an unknown `kind`, is drawn as a plain box or cylinder from its `shape`. The model always fits inside the cylinder `shape` when retracted, so the physics and the picture agree.
  - `visual.plume` adds an engine plume: `module` is the id of the module whose snapshot has `ignited`, `throttle` and `flameout` (the stock engine's state), `nozzle` the exit centre in the part frame (thrust is along local +Y, the plume points along -Y), `exitRadius` and `length` in metres (`length` is the plume at full throttle in air), `exitPressure` in Pa (default 60 000; the plume is narrow at pressures above it and wide below it). Smoke and dust at liftoff come from the same data.
  - `visual.deploy` animates a part from module state: `{ module, flag, seconds? }` reads the boolean `flag` of that module's snapshot (`stock.landing-leg` `deployed`). The stock legs draw four feet where the module's colliders are (a test pins `spread`, `drop` and `footSize` to the module defaults).
  - Explosions, burn-up, staging puffs and re-entry glow need nothing from the mod: the renderer recognises a part that disappears or a vessel that splits from successive snapshots and draws glow from `PartSnapshot.temperature`.
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

A body with no `parent`/`orbit` is a root body. A moon is a body with `parent` (a registered body id) and `orbit` (Kepler elements around it; `stock.cinder` in `mods/stock/src/bodies.ts` is the example, ADR 0052): the sim moves it on rails, gives it a Laplace sphere of influence and switches vessels between spheres (ADR 0051). Gravity is point-mass (one body at a time); the atmosphere is exponential.

## 5. The plugin

`definePlugin({ meta: { id, version, api: '^0.1' }, depends, optional, contributes, setup(ctx) })`. `setup` is synchronous and registers with `ctx.resources/modules/parts/bodies/systems.register(def)`. `api` is a range on the mod API version; a mismatch disables your plugin with a reason in the load report.

## Saves (API 0.1.12, ADR 0050)

A flight is saved as plain JSON: the world (every module's `state`) plus the sim's clock and bodies. So a module's `state` must be plain, JSON-compatible data (numbers that are finite, strings, booleans, arrays, plain objects; no `undefined` meaning something, no `Map`/`Set`/typed arrays, no functions), and anything a module needs between steps belongs in `state`, never in a closure or a module-level variable: it would be lost on load. A save lists the plugins that were loaded; loading refuses it when a plugin is missing (or a part or module id it uses is gone) and says which. Keep ids stable across releases, and when a new version changes the shape of a module's `state`, read the old shape in `update`/`snapshot` defensively or ask for a save-format migration (an ADR and a bump of `SIM_SAVE_VERSION`).

## 6. Testing a mod

```ts
import { loadPlugins } from '@orbital/sdk';
const { registries, report } = loadPlugins([Stock]);
expect(report.registered.part.map((e) => e.id)).toContain('stock.engine-lv');
```

`loadPlugins` validates schemas and cross-checks every part's module configs, so bad data fails the boot with the part and module named. To unit-test a hook, build a `ModuleContext` from `createWorld()` and `createEventBus()` (both exported by the SDK for this), the loaded `registries`, the module's parsed config, `module.state(config)` and a recording `vessel` stub; see `mods/stock/test/helpers.ts` (`fakeVessel`). To test with a real sim, `@orbital/sim`'s `createSim({ plugins: [Stock, YourMod], backendFactory })` is a test dependency, not something a mod imports in `src`.

## 7. Ship your mod (runtime loading, API 0.1.15, ADR 0057)

A mod outside the repo is a folder with a manifest and a source file; `examples/mod-sample` is a complete one (a part, a module that keeps its state in the world, a script).

```
my-mod/
  mod.json      { "id": "acme.mod", "version": "1.0.0", "api": "^0.1", "title": "...", "author": "...", "dependencies": { "stock": "*" } }
  src/index.ts  default-exports definePlugin({ meta: { id: 'acme.mod', version: '1.0.0', api: '^0.1' }, depends: ['stock'], setup(ctx) { ... } })
```

- `mod.json` and `meta` must agree on `id`, `version` and `api` (the loader checks and names the mismatch). `dependencies` lists plugin ids with version ranges; `stock` is one. Put the same ids in `depends` (ids are enough: you cannot import another mod's code, only its ids).
- Import only from `@orbital/sdk`. The build replaces that import by the SDK the game provides, so your bundle has no copy of it and uses the game's one `z`. To use a module of another plugin in a part, name it by id and declare its config shape with `declare module '@orbital/sdk' { interface ModuleMap { 'stock.resource-container': { ... } } }`, as the sample does.
- Build: `bun run tools/mod-build/build-mod.ts my-mod` writes `my-mod/dist/<id>-<version>.orbital-mod.json`: one JSON file with the manifest, the bundled code and a SHA-256 of the code. (In this repo `bun run build` inside `examples/mod-sample` does the same.)
- Install: open **Mods** on the start page, choose the file (or paste an https address of the file; the server must allow CORS), read the trust prompt and confirm. Nothing in the package runs before that. A mod is code with the page's own access (saves, storage, network): say plainly in your README what yours does. Enable, disable and remove it in the same list; **Reload to apply** restarts the page with the new set.
- What can go wrong, and what the player sees: a package that is not valid or was edited (refused with the reason), another API range (not loaded: "requires mod API ..."), a missing dependency, a plugin or part id that another mod or stock already owns (names both), a `setup` that throws (its message). One failing mod never stops the game or the other mods.
- Looks: a part's `visual.kind` selects one of the game's generators (`tank`, `capsule`, `engine`, ...) with your `palette` and `params`; a mod cannot add geometry code or models yet (draft plan 051).
- Test it the way the game loads it: `examples/mod-sample/test/sample.test.ts` builds the package, reads it with `parseModPackage`, loads it with `resolveMods(..., { importModule: importModBundle })` after `installModSdk(sdk)` and flies it in a sim.
- Saves list the mods in use (`id` and `version`). Keep ids stable; a save that needs a mod that is off, failed or removed says which.

## Open items

- `defineSystem` (per-step logic over the world, phases `pre-physics`/`post-physics`) is supported by the sim but has no stock example yet; this guide will gain a section when one exists.
- The HUD's throttle gauge still reads the stock engine's snapshot (a mod engine falls back to the page's own throttle display); mod-supplied VAB categories are plan 029.
- Mod-supplied geometry and assets (new generators, glTF in a package) and a hosted mod repository are not built (draft plan 051).
