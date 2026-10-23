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
- **Wings** (ADR 0075): `stock.wing` (`wingConfigSchema`: `area`, `aspectRatio` of the pair, `efficiency`, `stallAngle`, `parasiteDrag`, `crossflow`, `centre`, `damping`) is the fin's geometry with a finite-wing lift slope `a0 / (1 + a0 / (pi e AR))`, a stall and induced drag `C_L² / (pi e AR)`: `wingCoefficients` and `wingForce` in `mods/stock/src/modules.ts` are pure and tested against hand values, and a craft with a pair at 0.15 rad incidence (a design `tilt`, ADR 0071) glides at about 5:1. Report the plate in `describe` as `lift` so the VAB's stability read-out counts it. Extra `damping` is off for wings (it is unstable for parts metres from the roll axis).
- **Struts and fuel lines** (API 0.1.19, ADR 0071): a part with `connector: {}` or `connector: { feeds: true }`, one horizontal node (stock: `end`, `dir [-1, 0, 0]`), a thin shape and the visual kind `strut` or `fuel-line` (the renderer draws the bar between the part and the far end of its design `link`; a mod uses those kinds or its own generator for the stub). A connector hangs on one part and its design entry names the surface point of a second part it ends on; the fuel line carries propellant from the part it hangs on to the part it ends on. A strut is structural only: the vessel is one rigid body.
- **Steering parts** (API 0.1.10, ADR 0045): `vessel.centreOfMass` (part frame, flight only) and `vessel.torqueDemand` (the attitude demand as a torque direction in the part frame) are what an actuator needs. Do not invent a mapping: `mods/stock/src/steering.ts` has the one rule stock uses (`mixFraction`: demand fraction = deflection fraction, the sign follows the lever arm, less authority within 1 m of the centre of mass, `gimbalTarget`, `surfaceTarget`, `slew`). `stock.engine` takes `gimbal: { range: degrees, rate: degrees per second }` (default none; the stock LV-T30 has 3 and 20) and publishes `gimbal: [towardX, towardZ]` rad in its snapshot; `stock.control-surface` is a fin (`area`, `liftSlope`, `crossflow`, `centre`, `damping`) with `maxDeflection` and `deflectionRate` that publishes `deflection`. Fins and control surfaces take `damping` (default 60, ADR 0046): extra damping of the rotational airflow, `0` for the plain plate. To show a moving piece, give the part visual `articulation: { module, field, mode: 'gimbal' | 'hinge' }` and a renderer generator that puts the moving geometry in `ctx.moving` and returns `{ pivot }`; the engine bell and the control-surface plate are built that way.
- **Asset models** (ADR 0047, 0076): a mod ships a model with `visual.asset` (below). A host that is not a mod package may still use `{ kind: 'model', params: { url, fallbackKind } }` with `GltfPartProvider` (put it first in `partProviders` and `await factory.preload(ids)`). Asset parts get the plume, the gimbal/hinge articulation and temperature glow like generated ones; `deploy` animations are not available to them.
- **Control authority** (API 0.1.11, ADR 0049, plan 042): a steering module may define `controlAuthority(ctx): Vec3`, the largest torque in N·m it can add about each part axis (x pitch, y roll, z yaw, all >= 0) right now, zero when it cannot steer (a cold engine, an unpowered wheel, a control surface in vacuum). The stability assist divides the vessel's sum by its inertia to size its demand, so a part with this hook is steered by SAS like stock's; without it SAS ignores the part. Helpers: `gimbalAuthority`, `surfaceAuthority` in `mods/stock/src/steering.ts`.
- `updateOnRails(ctx, dt)` may use resources but not forces; `dt` can be up to 10 s.
- **The module owns the schema, the state and the pure arithmetic** (`engineOutput`, `withdraw`, `deposit`), so tests can exercise it without a sim.
- Actions take `unknown` arguments: validate them (stock uses `z.tuple([...]).parse(args)`).
- `absorbHeat(ctx, { power, temperature }, dt)` (ADR 0023) is called each flight step in which the airflow puts `power` W on the part, before its skin warms; return the watts you carry away (clamped to `0..power`) and change `ctx.state` accordingly. Stock's heat shield burns `power·dt / heatOfAblation` kg of its `stock.ablator` once its skin is above `ablationTemperature`, and declares a `store` for the ablator so its mass counts.
- `colliders(config, state)` adds collision boxes to the part for the current state (stock's landing leg returns four feet when `state.deployed`, none when retracted). It must be a pure function of config and state; the vessel body is rebuilt after a dispatched action or stage changes it.
- `joint(config, state)` makes the module a robotic joint (API 0.1.98, ADR 0269): return `{ kind: 'rotate' | 'translate', axis, pivot, node, value }` and move `value` in `update`. The sim turns or slides the parts on `node` to match, inside the vessel's one body. Start the state with `applied: 0`; the sim keeps it. `stock.robotic` (hinge, servo, rotor, piston) is the example.
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

### Part actions (API 0.1.34, plan 110, ADR 0174)

Give the player a switch, slider, choice or button for your module, with no UI code: return `actions` from `describe(config, state)`.

```ts
describe: (config, state) => ({
	actions: [
		{ id: 'setOn', label: 'Floodlight', kind: 'toggle', value: state.on, enabled: true, group: 'stock.lights', icon: 'light' },
		{ id: 'setPower', label: 'Brightness', kind: 'value', value: state.power, min: 0, max: 1, step: 0.1, enabled: state.on, reason: 'Turn it on first' }
	]
}),
actions: {
	setOn: (ctx, on) => { ctx.state.on = on as boolean; },
	setPower: (ctx, power) => { ctx.state.power = power as number; }
}
```

- `id` is the name of one of your `actions`. A `toggle` is called with `true` or `false`, a `value` with a number in `min..max`, a `mode` with one of `options[].value`, and a `trigger` with nothing. The sim checks the argument and `enabled` before calling.
- `group` puts the control in an action group: the Overview tab of the vessel panel (plan 111) shows one switch per group, and `action-group` sets every member in the same tick. Stock groups are `stock.engines`, `stock.batteries`, `stock.solar`, `stock.lights`, `stock.antennas`, `stock.science`, `stock.docking`, `stock.landing-gear` and `stock.parachutes`. Add your own with `ctx.actionGroups.register(defineActionGroup({ id: 'acme.winches', label: 'Winches' }))`.
- Players can also make custom groups in a design (slots 1 to 10, on the number pad by default) and an Abort group (slot 0, Backspace in flight, ADR 0233); they call your actions the same way.

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
- `visual` (optional, API 0.1.6, ADR 0028) is what the part looks like. `kind` names a procedural generator in the renderer: `capsule`, `tank`, `engine`, `decoupler`, `reaction-wheel`, `landing-legs`, `heat-shield` (the stock ones) or `plain` (a painted barrel from `shape` and `palette`). `palette` gives `primary`, `secondary` and `accent` paint as `#rrggbb`; `params` is a flat record of numbers read by the generator (for example tanks read `stripe` and `bands`, the legs read `spread`, `drop` and `footSize`; unknown keys are ignored and values are clamped). Tanks, `plain` barrels and boosters also take a string `livery` (plan 291): `plain`, `stripe` (the default look), `bands` (white with black bands), `checker` (a roll pattern on the lower third), `half-black`, `foam` (orange insulation, as on an external tank) or `steel` (bare metal). A part without a `visual`, or with an unknown `kind`, is drawn as a plain box or cylinder from its `shape`. The model always fits inside the cylinder `shape` when retracted, so the physics and the picture agree.
  - `visual.plume` adds an engine plume: `module` is the id of the module whose snapshot has `ignited`, `throttle` and `flameout` (the stock engine's state), `nozzle` the exit centre in the part frame (thrust is along local +Y, the plume points along -Y), `exitRadius` and `length` in metres (`length` is the plume at full throttle in air), `exitPressure` in Pa (default 60 000; the plume is narrow at pressures above it and wide below it). Smoke and dust at liftoff come from the same data.
- `visual.plume.nozzles` (API 0.1.23, optional, 2 to 9 points in the part frame) gives an engine one plume per bell: list the exit centre of each; `nozzle` stays the thrust centre (dust, ground light and the exhaust trail use it) and `exitRadius` and `length` apply to every bell. The `engine-cluster` generator draws `params.bells` bells on a ring of radius `params.ring` with exit radius `params.bellExit` (stock's `stock.engine-cluster` is the example); an asset model lists its own bell positions in `nozzles`.
  - `visual.deploy` animates a part from module state: `{ module, flag, seconds? }` reads the boolean `flag` of that module's snapshot (`stock.landing-leg` `deployed`). The stock legs draw four feet where the module's colliders are (a test pins `spread`, `drop` and `footSize` to the module defaults).
  - Explosions, burn-up, staging puffs and re-entry glow need nothing from the mod: the renderer recognises a part that disappears or a vessel that splits from successive snapshots and draws glow from `PartSnapshot.temperature`.
- `impactTolerance` (m/s, optional, default 6): ground impact speed above which the part breaks off the vessel; above twice it, the part is destroyed. The sim reports both as the `part:damaged` event (`{ vessel, part, definition, speed, outcome, cause: 'impact' }`). Stock: pod 10, tanks 5, engine 4, legs 12.
- `maxTemperature` (K, optional, default 1000): skin temperature above which re-entry heating destroys the part (`part:damaged` with `cause: 'overheat'` and `temperature`). Stock: tanks 900, pod/wheel/decoupler/legs 1000, engine 1800, heat shield 3000. Parts carry a `temperature` in the snapshot.
- Attach nodes: stack parts have `top` (+Y) and `bottom` (-Y) on the axis, `dir` pointing away from the part.
  - A node's `size` is its joint diameter, m. The stock classes (`NODE_SIZES`, ADR 0256) are 0.625, 1.25, 1.875, 2.5, 3.75, 5 and 7.5. Two joined stack nodes should have the same size; between classes, use an adapter. Stock has one for each step, from `stock.adapter-small` (0.625 to 1.25) to `stock.adapter-5000-7500`.
  - A stack node without a `size` takes the class nearest to its cylinder's diameter, by ratio. Since plan 289 added 1.875, **a size-less part about 1.53 to 2.17 m across now takes 1.875**: one from 1.53 to 1.77 m took 1.25 before, and one from 1.77 to 2.17 m took 2.5. Declare `size` on your nodes to keep the class you meant. Every stock part declares its sizes, and none changed.
- `connector` (optional, API 0.1.19, ADR 0071): marks a strut or fuel line (see Lifting surfaces and Struts above). A radial part may now attach to a box-shaped parent (a control surface on a wing). Engines that report `axis` in `describe` get their cosine loss in the stage Δv when a design tilts them.
- A part is plain data, so the same thing written as JSON (`modules: [["stock.engine", {...}]]`) is accepted and validated the same way.

## 4. Bodies

```ts
export const HomeBody = defineBody({
	id: 'stock.home',
	mass: 3.5316e12 / 6.6743e-11, // from mu = G·M
	radius: km(600),
	rotationPeriod: 21_600,
	atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: km(70) },
	terrain: { kind: 'hills' }
});
```

**An aurora (API 0.1.24, ADR 0093).** A body with an `atmosphere` has an aurora by default: curtains about its magnetic pole (the rotation axis tilted 9.4 degrees) on the night side, drawn from 80 to 320 km above the surface. `atmosphere: { ..., aurora: false }` switches it off for a body; there is nothing else to author.

A body with no `parent`/`orbit` is a root body. A moon is a body with `parent` (a registered body id) and `orbit` (Kepler elements around it; `stock.cinder` in `mods/stock/src/bodies.ts` is the example, ADR 0052): the sim moves it on rails, gives it a Laplace sphere of influence and switches vessels between spheres (ADR 0051). Gravity is point-mass (one body at a time); the atmosphere is exponential.

**Paths that drift (API 0.1.50, plan 123, ADR 0183).** A body whose orbit is not a fixed conic says so with `orbit.model`. For a real planet, take its JPL Level A row: `const { elements, rates } = levelAElements({ a: [1.52371034, 0.00001847], e: [...], I: [...], L: [...], peri: [...], node: [...] })` (from `@orbital/sdk`), then `orbit: { ...elements, model: 'kepler-rates', rates }`. A moon with a periodic theory uses `model: 'series'` with `series: { longitude, latitude, parallax, parentRadius }`, in degrees and Julian centuries, as in the Astronomical Almanac. Keep the six elements as the mean conic: they size the sphere of influence. These models run on J2000 time, and the world's epoch puts the body at the right date. `docs/research/ephemerides.md` lists the sources.

**A system of your own, and its scales (API 0.1.54, plan 124, ADR 0184).** Register a variant and your bodies become a system a world can choose instead of stock:

```ts
ctx.systemVariants.register(defineSystemVariant({
	id: 'acme.full', system: 'acme', variant: 'full', label: 'Full scale',
	description: 'What this scale means for the player.', home: 'acme.terra',
	facts: { dvToOrbit: 6_000, moonTransfer: 3 * 86_400 },
	patches: [/* balance for this scale: ordinary patches (ADR 0170) */]
}));
```

- The loader keeps one system's bodies per world. Every plugin that registers a variant owns its bodies as a system, and every other plugin's bodies belong to stock.
- The chosen variant's patches apply only in that variant's worlds. A smaller scale is a set of `set` patches on your own bodies that your pack computes (the Sol pack keeps surface gravity and periods real: sizes ×k, masses ×k², distances ×k^(2/3)).
- `rotation.epoch: 'j2000'` measures your bodies' spin at J2000, like their orbits.
- Create World shows each variant's `facts`.
- `mods/sol` is the worked example, with its validation suite in `packages/sim/test/sol-validation.test.ts`.

**A picture for your system (API 0.1.101, plan 317, ADR 0273).** Create World draws each system's card from its bodies: the star, the planets in orbit order, moons beside them, and sizes and tints from the data (air and hills make a blue world, craters a grey one, a large body without a surface a banded giant). You get that for free. To ship your own picture, give a variant `illustration` (the card) and `icon` (the square badge): each is a `data:` URL of an SVG, PNG, WebP or JPEG image, at most 128 KiB. The first variant that has one is used for the system. A preset takes the same two fields for its mode card (`definePreset({ ..., illustration })`). Presets without one get a generated orbit glyph in a colour from their id. Pictures are drawn as images, so an SVG's script never runs.

**The ground of a body (API 0.1.18, ADR 0067).** `terrain` names the kind of ground the body has: `{ kind: 'hills' }` (the home planet's ridged terrain, for the first body: the launch site stands on its flat zone at latitude 0, longitude 0) or `{ kind: 'craters', seed?: 0..999 }` (the stock moon's cratered regolith with its landing plain at latitude 0, longitude 0; another `seed` is another set of craters, rims and hills, so a third airless body with its own look is one line of data). A body without `terrain` is a smooth sphere, whatever its parent or atmosphere. **A rock of a few kilometres** says `{ kind: 'craters', seed: 41, small: true }` (API 0.1.114, ADR 0320): no landing plain, an irregular lumpy shape up to 0.6 of the radius high, and craters scaled to the radius (the plain kind would be one flat plain on a 7 km body). The kind decides the sim's ground (`createBodyTerrainField`) and what the renderer draws; a kind is code in core and the renderer, so a mod picks one and does not supply a height function. Both kinds are drawn on any body after the first (plan 059, ADR 0090): a second planet with `{ kind: 'hills' }` is a globe with the home planet's continents seen from orbit and the hills the sim stands vessels on near the ground, with or without an `atmosphere` in its definition (the sim gives it drag; the renderer draws no sky, haze or sea waves on it, and no launch-site buildings, clouds, terrain shadows or stones: draft plan 071). It shares the home planet's biome map and flat grassland at latitude 0, longitude 0 (its own radius changes the hills, not the coasts; a `seed` or `site` on `hills` is draft 071), and a vessel placed there should use `surface` placement at that longitude or a hillside the field makes gentle. On a craters body the sun casts the craters' shadows and stones lie about the ground (ADR 0068); a stone has no collision (draft plan 060).

**Water (API 0.1.47, plan 067, ADR 0182).** A `hills` body has seas and lakes that vessels float on or sink in; craters and smooth bodies have none. A part's buoyancy comes from its `shape` volume, so a light, wide part floats a vessel: the stock `stock.flotation-collar` (radius 1.25 m, 0.6 m, 40 kg) keeps a capsule upright. A part hitting water is judged by its `impactTolerance` at half the entry speed.

## 5. The plugin

`definePlugin({ meta: { id, version, api: '^0.1' }, depends, optional, contributes, setup(ctx) })`. `setup` is synchronous and registers with `ctx.resources/modules/parts/bodies/systems.register(def)`, and data patches over other plugins' entries with `ctx.patches.register(def)` (see "Patching another mod's data"). `api` is a range on the mod API version; a mismatch disables your plugin with a reason in the load report.

## Data items (API 0.1.31, plan 083, ADR 0172)

Data is sized: a `DataItem` has a `kind`, a size in `bits`, a `value` and the sim `time` it was made. A mod adds kinds with `ctx.dataKinds.register(defineDataKind({ id: 'acme.radar', label: 'Radar', priority: 3, valueCurve: [[0, 1], [86_400, 0.2]] }))`: a lower `priority` goes first when data is sent (plan 119), and the curve says what fraction of the value is left at an age. Stock has `stock.telemetry`, `stock.voice`, `stock.science`, `stock.image` and `stock.bulk`.

- **Store** from any module hook or action: `ctx.vessel.data.store({ kind: 'stock.science', bits: 8_000, value: 5, time: ctx.vessel.time, subject: 'acme.radar@home' })`. It returns the new item's id, or `undefined` when no storage on the vessel had room: then the item is lost and the sim emits `data:dropped`. Storages are filled in part order. Stored items are never pushed out by new ones.
- **Hold** data in your own part: declare `dataStorage: { capacity: (config) => config.capacity }` on a module whose `state` returns `{ items: [], next: 0 }`, or reuse `stock.data-storage` (`[['stock.data-storage', { capacity: 1_000_000 }]]`). The items are module state, so they are saved and go with the part when the vessel splits.
- The player can move items between storages (`move-data`) and delete them (`delete-data`). `packages/sim/test/data.test.ts` has a recorder part that stores through an action.

## Contracts, missions and objectives (API 0.1.37, plan 098, ADR 0175)

A contract or mission is data: a tree of objectives with rewards. Use the stock primitives or write your own.

```ts
ctx.contracts.register(defineContract({
	id: 'acme.first-orbit',
	title: 'First orbit',
	objectives: { sequence: [
		{ objective: 'stock.reach-orbit', params: { minPeriapsis: 80_000 } },
		{ objective: 'stock.return-home' }
	] },
	reward: [{ currency: 'funds', amount: 20_000 }, { currency: 'reputation', amount: 5 }],
	deadline: 30 * 21_600 // 30 stock days after the start
}));
```

- Trees combine with `all`, `any` and `sequence`. A sequence counts its steps only in order, so landing first and orbiting later does not finish "orbit, then return".
- Stock primitives: `stock.reach-orbit { body?, minPeriapsis, maxApoapsis? }`, `stock.land { body? }`, `stock.reach-altitude { body?, min }`, `stock.enter-soi { body }`, `stock.flyby { body }`, `stock.return-home`, `stock.before { time }`.
- Your own primitive: `ctx.objectives.register(defineObjective({ id, label, params: z.object({...}), evaluate: (params, view, prior) => ({ status, progress, data }) }))`. Keep `evaluate` pure: it reads only `view` (time, home body, vessels) and `prior` (its last result; keep memory in `data`). Name the events it should react to in `on` (default: every step).
- The sim starts one with `objective-start` (plan 099 offers contracts, plan 100 the story line), reports it in `Snapshot.objectives`, and pays the reward into the ledger when the economy is on.

### Rival agencies (API 0.1.70, plan 126, ADR 0190)

```ts
ctx.agencies.register(defineAgency({
	id: 'acme.orbital',
	name: 'Acme Orbital',
	personality: { aggressiveness: 0.7, risk: 0.4 },
	budget: { start: 100_000, monthly: 25_000 },
	programme: [
		{ id: 'acme-relay', kind: 'relay', altitude: 2_200_000, cost: 55_000, success: 0.85, prepDays: 40, lifeDays: 900, rent: 300 }
	]
}));
```

- **What runs:** a world runs the first `stock.agency-count` registered agencies, so register yours before stock's (a plugin that boots earlier) or raise the count.
- **What a success places:** a passive probe core and dish on rails, owned by the agency.
- **What the player can do:** see and target the object, rent a relay (`relay-rent`, booked daily), and take the contract an agency offers when one of its relays fails.

### Discovery facts (API 0.1.72, plan 129, ADR 0192)

```ts
ctx.discoveryFacts.register(defineDiscoveryFact({
	id: 'acme.methane-lakes',
	label: 'Methane lakes',
	unit: '% of the surface',
	chance: 0.2, // a body has it with this probability, from the world seed
	range: [2, 40], // its value when present; absent = 0
	tolerance: 5, // a claim within this is correct
	resolution: 8, // raw error, one standard deviation
	instruments: ['stock.pressure'] // data experiments whose results measure it
}));
```

- **Only with `stock.science-depth` `discovery`.** With `classic` nothing measures and the commands refuse.
- **The player:**
  - processes datasets in the lab (raw, then calibrated, then derived; the error halves, then halves again);
  - claims a value with a confidence from the body dossier.
- **Peer review** judges a claim three days later:
  - overclaiming (wrong at high confidence) costs reputation;
  - a right claim pays more the surer it was;
  - the first right claim of a fact gets priority.

### Strategies (API 0.1.65, plan 101, ADR 0187)

```ts
ctx.strategies.register(defineStrategy({
	id: 'acme.fly-cheap',
	label: 'Fly cheap',
	description: 'Cheaper launches, smaller science returns.',
	effects: [{ key: 'launch-cost', factor: 0.9 }, { key: 'science', factor: 0.9 }],
	upkeep: 1_200, // funds every 30 days
	agencyTypes: ['company', 'hybrid'] // offered only there; omit for every agency type
}));
```

- **Keys and bounds:** `launch-cost` 0.75 to 1.25, `recovery` 0.75 to 1.5, `science`, `reputation` and `contract-funds` 0.5 to 1.5, `budget` 0.8 to 1.2. A factor outside its key's bounds fails at load. Several active strategies multiply, and the result is clamped to the bounds.
- **Your own charge** can follow the `budget` key: `defineCharge({ ..., multiplier: 'budget' })`.
- **The player** activates and ends strategies in Administration, within the `admin` slots. An ended strategy waits `cooldownDays` (default 30) before it can come back.

### Contract templates (API 0.1.63, plan 099, ADR 0186)

A template makes procedural contracts. The world offers one at most each day, while fewer than five offers wait.

Since API 0.1.85 (plan 231, ADR 0231):
- **`ctx.milestones`** lists the world's firsts (`orbit:stock.home`, `dock:stock.home`). Return null until the one your job needs exists.
- **`spawn: { design, body, altitude, member: true }`** makes a vessel when the player accepts: the design in a circular orbit, with a stranded crew member aboard. The stock `stock.rescue` objective is done once they are recovered at home.
- **The objective view** also tells inclination, seats, crew, antenna, power, ports and docked per vessel. The stock primitives `stock.satellite`, `stock.station` and `stock.dock` use them.

```ts
ctx.contractTemplates.register(defineContractTemplate({
	id: 'acme.high-hop',
	label: 'High hop',
	tier: 1, // prestige 1 to 3; tiers 2 and 3 need 100 and 300 reputation unless you set minReputation
	maxOffers: 1, // at most one of these on the board at once
	generate: (ctx) => {
		const h = 50_000 + Math.round(ctx.random() * 10) * 5_000; // draw only from ctx.random()
		const deltaV = 1_500;
		const cost = estimatedLaunchCost(deltaV);
		return {
			key: `high-hop:${h}`, // the same key is the same job: never offered twice at once, and kept out after a decline
			title: `Hop to ${h / 1000} km`,
			brief: 'Any vessel launched after you accept may do it.',
			objectives: { objective: 'stock.reach-altitude', params: { min: h } },
			advance: [{ currency: 'funds', amount: Math.round(0.2 * cost) }],
			reward: [{ currency: 'funds', amount: Math.round(1.1 * cost) }],
			penalty: [{ currency: 'funds', amount: -Math.round(0.5 * cost) }],
			deadline: 20 * ctx.dayLength,
			deltaV // shown as the estimate behind the expected value
		};
	}
}));
```

- **What `ctx` holds:** `home`, `bodies` (`{ id, label, parent, radius, mu, a }`), `reputation`, `time`, `day`, `dayLength`, and `window(target)`, the next Hohmann window to a sibling of the home body (`{ departure, travel }` or null). Return `null` when the template has nothing to offer in this system.
- **The player** accepts (the advance is paid; Mission Center slots), declines, or cancels (the penalty is booked) from Administration. Only vessels launched after the acceptance count towards it.
- **Expected value** is advance plus reward funds, minus `estimatedLaunchCost(deltaV)`.

## Crew (API 0.1.38, plan 106, ADR 0176)
- **Seats.** Give a crewed part seats with `crewCapacity: 2`. The launch (`load-vessel`) seats roster members by design part index, and `crew-transfer` moves them between parts of one vessel.
- **Traits.** `ctx.crewTraits.register(defineCrewTrait({ id: 'acme.calm', label: 'Calm', abilities: { panicResistance: 1.3 } }))`. A trait can only scale quality factors (`controlSmoothing`, `scriptBudget`, `repairRate`, `dataQuality`, `gTolerance`, `panicResistance`); no trait or level ever turns a tool on or off.
- **Names.** Add syllables with `defineCrewNames({ id, first: [...], last: [...] })`; hired names are drawn from them with the world's own random stream, so the same world always hires the same people.
- XP is booked when a vessel is recovered, for each place its crew had not been before (fly by, orbit or land on a body). The world's rules decide death (`stock.crew-death`) and salaries.

### Life support (API 0.1.46, plan 107, ADR 0181)

- **Carry consumables** in any container: `[ModuleResourceContainer, { contents: { 'stock.supplies': { capacity: 9 } } }]` is three crew-days for three people. With life support `simple` the crew draw supplies. With `full` they draw `stock.oxygen`, `stock.water` and `stock.food` instead, one unit each per person per day.
- **A scrubber.** With `full`, someone must scrub the CO2. Use `['stock.scrubber', { crew: 2, charge: 8 }]` on your part, or give your own module `scrubber: (config) => ({ crew, charge })`. `charge` is EC per served person per day.
- The vessel snapshot predicts the time left for each consumable. A run-out starts a grace period, and then the world's death rule applies.

### How crew look and move (API 0.1.111, plan 375, ADR 0313)

The crew character (ADR 0291) is drawn from what plugins register, and stock registers its own through the same five registries. `examples/mod-crew-sample` uses each of them. It adds:
- a band outfit for the Hangar crew;
- a marching walk that replaces stock's;
- a cheer;
- a face;
- a portrait image;
- a patch that paints stock's mechanics teal.

```ts
ctx.crewOutfits.register(
	defineCrewOutfit({
		id: 'acme.band',
		title: 'Marching band',
		body: 'coat', // suit | coat | shirt
		suit: 0xb3202a, trim: 0xf2c94c, accent: 0xf2c94c, legs: 0x1d2333, boots: 0x111318,
		gloves: 'skin', // or a colour
		headwear: 'cap', headwearColour: 0xb3202a, // none | helmet | hard-hat | cap | headset | goggles | pilot-goggles
		eyewear: 'none', prop: 'none', pack: 'none', harness: true,
		uses: ['hangar', 'space-center'], // pod | eva | hangar | space-center | lineup
		professions: ['engineer'] // optional: what engineers wear at the Space Center
	})
);
ctx.crewAnimations.register(
	defineCrewAnimation({
		id: 'acme.march',
		title: 'March',
		role: 'walk', // idle | walk | wave | work | eva
		keys: [
			{ t: 0, pose: { legLPitch: 0.9, legRPitch: -0.35 } },
			{ t: 0.5, pose: { legLPitch: -0.35, legRPitch: 0.9 } }
		],
		duration: 1 // or `pose: (t, { walked, seed }) => ({ ... })` instead of keys
	})
);
ctx.crewExpressions.register(
	defineCrewExpression({
		id: 'acme.star-eyed',
		title: 'Star-eyed',
		mood: 'excited', // optional: the game asks for happy | sad | sleepy | …
		eyes: { left: 'wide', right: 'wide' }, // open | big | wide | closed-up | closed-down
		brows: { tilt: [0.2, 0.2], lift: 0.02 },
		mouth: 'grin' // smile | grin | o | small-o | tilt | frown
	})
);
ctx.crewLooks.register(defineCrewLook({ id: 'acme.green-eyes', title: 'Green', kind: 'eye-colour', colour: 0x2f8a3a }));
ctx.crewPortraits.register(
	defineCrewPortrait({ id: 'acme.band-face', title: 'Band', image: 'portraits/band.png', outfit: 'acme.band' })
);
```

- **Outfits.**
  - The shapes (headwear, props, packs, the body cut) are the renderer's pieces; your outfit picks among them and colours them.
  - `uses` says where the game dresses people in it:
    - the Hangar and Space Center walkers take turns through every outfit registered for their place;
    - `pod` and `eva` take the last one registered, so yours replaces stock's.
  - To change a stock outfit without replacing it, patch it: `target: 'crew-outfit'`, `select: { id: 'stock.mechanic' }`, `ops: [{ op: 'set', path: 'suit', value: 0x1f8a8a }]`.
- **Animations.**
  - The pose has eleven channels: `bob` in metres; `lean`, `headPitch`, `headYaw`, `headRoll`, `armLPitch`, `armLRaise`, `armRPitch`, `armRRaise`, `legLPitch` and `legRPitch` in radians. Missing channels are 0.
  - Keyframes ease between keys and loop over `duration`.
  - A keyframed `walk` spans one stride (0.84 m), so the feet keep pace with the ground.
  - For each role, the animation registered last is the one the game plays.
  - `eva` shows in the developer line-up only: the EVA figure in flight is a rigid part.
- **Looks.**
  - Skin, hair colour, hair style (`tousled`, `swept`, `short`) and eye colour.
  - A crew id draws one look of each kind from its hash, by `weight` (default 1).
  - Adding a skin can change who gets which skin, but not their hair.
- **Portraits.**
  - An image asset (`.png` or `.webp`, at most 512 KB) in your package under `assets/`, or generated by `assets.ts`.
  - It replaces the painted portrait for every member in `outfit`, or for one `crew` id; the crew match wins.
  - A package with images is format 3.
  - A portrait naming an image the package lacks makes the mod fail to install, with the file named.
- **See it.** Developer → Crew lists every outfit, face, animation, look and portrait by mod. It marks the animation in use per role and plays any of them. Developer → Mods shows whether your mod loaded.

## Site templates (API 0.1.39, plan 092, ADR 0177)

A template is a quick start for Create World, resolved on each world's own terrain:

```ts
ctx.siteTemplates.register(defineSiteTemplate({
	id: 'acme.desert-coast',
	label: 'Desert coast',
	description: 'Dry, on the sea, launches go east over water.',
	criteria: { absLatitude: [0.2, 0.5], seaEast: true, seaDistance: 200_000 }
}));
```

- `absLatitude` is a band of |latitude| in radians (both hemispheres). `seaEast`, `inland`, `island` and `minElevation` (biome map elevation, sea level 0.46) narrow it. When a world has no spot that meets them all, they are dropped in that order and Create World says so.
- `resolveSiteTemplate(template, { seed, radius })` and `siteConsequences(site, body, seed)` are pure; use them to show a template's result in your own screens.

## Science (API 0.1.40, plan 103, ADR 0178)

- **An experiment.** `ctx.experiments.register(defineExperiment({ id: 'acme.magnetometer', label: 'Magnetometer', kind: 'data', situations: ['stock.space-low', 'stock.space-high'], baseValue: 12, repeatFactor: 0.5, duration: 10, power: 0.1, bits: 16_384, transmitFactor: 0.8 }))`. The first result in a subject (experiment × body × situation) is worth `baseValue` × the body's multiplier, and each later one `repeatFactor` times the last. The total stops at `capFactor` (default 3) × `baseValue` × multiplier.
- **A part that runs it.** Use the stock module: `modules: [['stock.experiment', { experiment: 'acme.magnetometer', label: 'Log field' }]]`. Its `run` action starts the experiment. A finished data run stores a `stock.science` data item, which the player transmits (`transmit-data`) or brings home. A sample (`kind: 'sample'`, with a `mass`) stays in the part until the vessel is recovered.
- **Your own module** can call `ctx.vessel.situation()` and `ctx.vessel.science.result(id)`, which fixes the value now. It reports itself through `describe().experiment` and credits held results in `onRecover` with `ctx.vessel.science.credit(subject, value)`.
- **Situations and bodies.** Stock situations are `stock.landed`, `stock.splashed`, `stock.flying-low`, `stock.flying-high`, `stock.space-low` and `stock.space-high`. Set a body's `science: { flyingHigh, spaceHigh, multiplier }` to move the thresholds. A new situation (`defineSituation`, a pure `matches(view)`) slots in by `order`.

### Regions and dossiers (API 0.1.45, plan 104, ADR 0180)

- **Regions on your body.** Use latitude bands, `regions: { kind: 'bands', bands: [{ id: 'tropics', label: 'Tropics', from: -0.4, to: 0.4 }, { id: 'poles', label: 'Poles', from: 0.4, to: 1.5708, multiplier: 2 }] }`, or seeded cells, `regions: { kind: 'cells', seed: 3, regions: [{ id: 'plains', label: 'Plains' }, { id: 'ridges', label: 'Ridges', multiplier: 1.5 }] }`. A body with the home planet's `hills` terrain can use `{ kind: 'biomes' }`, the biomes its ground is drawn with. Region ids are lower-case words joined by `-`.
- **Which results depend on the region.** A situation with `regional: true` (all stock ones except `stock.space-high`) gives each region its own subject, so a result there is worth its region's multiplier.
- **A dossier entry.** `ctx.dossierEntries.register(defineDossierEntry({ id: 'acme.magnetic-field', label: 'Magnetic field', order: 10, fact: 'gravity', unlock: { experiments: ['acme.magnetometer'] } }))`. The `fact` picks what the card shows: `atmosphere`, `gravity`, `surface`, `regions` or `resources`. The entry unlocks with the first result on the body that matches `unlock`.

## Antennas and ground stations (API 0.1.42, plan 114, ADR 0179)

- **An antenna.** `ctx.antennas.register(defineAntenna({ id: 'acme.relay-dish', label: 'Relay dish', kind: 'dish', range: 5e10, power: 80 }))`, then give a part `modules: [['stock.antenna', { antenna: 'acme.relay-dish' }]]`. Two nodes link under `√(range_a × range_b)` (times the world's `stock.comms-scale`), with a clear line of sight past bodies and terrain. The vessel uses its strongest switched-on antenna; the module's `setEnabled` action toggles it.
- **Your own antenna module** declares `antenna: (config, state) => ({ antenna, enabled })`.
- **A ground station.** `ctx.groundStations.register(defineGroundStation({ id: 'acme.north-station', label: 'North station', body: 'stock.home', latitude: 1.2, longitude: 0.4, range: 5e10 }))`. Every world site is already a station.
- **Probes.** A control source on a part without seats (`crewCapacity` 0) makes a probe. Without a link it follows the world's `stock.control-without-signal` rule. Read the state in a module with `ctx.vessel.signal()`.

**Bands and data rates (API 0.1.60, plan 116, ADR 0185).**

- **A band.** `ctx.bands.register(defineBand({ id: 'acme.c', label: 'C band', frequency: 5e9, noiseTemperature: 120 }))`. Stock registers `stock.uhf`, `stock.s`, `stock.x`, `stock.ka` and `stock.optical`.
- **An antenna's band.** Add `band` and either a fixed `gain` (dBi) or a dish `aperture` (m) to the antenna, for example `defineAntenna({ ..., band: 'stock.x', aperture: 2 })`. Without a known band, the antenna links as in tier 1 and has no data rate.
- **What the link carries.** The range rule above still decides whether a vessel is linked. The link's rate comes from a Friis budget on the best band the two ends share:
  - stations receive on every band, with a 10, 34 or 70 m dish by tier, or the station's own `aperture`;
  - `stock.comms-scale` divides the distance in the budget;
  - the rate steps through decades from 1 kbit/s to 1 Gbit/s, every 10 dB of margin.
- **Reading it.** `ctx.vessel.signal().rate` gives the rate in bit/s. The pure functions `linkBudget`, `freeSpaceLoss`, `dishGain`, `antennaGain` and `rateForMargin` are exported from `@orbital/sdk`.

**Relays, pointing and route policies (API 0.1.67, plan 117, ADR 0188).**

- **Relays:** any vessel with a working antenna relays. Routes go through relays to a station or a crewed vessel.
- **Dishes point:** the `antenna-point` command (`target`: a station, `vessel:<id>` or a body id; null is Auto). A dish then reaches only within half its beam. Give a dish `beamWidth` (rad), or let the beam follow from its band and `aperture`.
- **A route policy:**

  ```ts
  ctx.routePolicies.register(defineRoutePolicy({
  	id: 'acme.prefer-relays',
  	label: 'Prefer relays',
  	choose: (routes) => routes.findIndex((r) => r.hops.length > 1) // −1 falls back to the first
  }));
  ```

  `choose` is pure, and gets the best route through each neighbour as `{ hops, width, latency }`.
- **Reading it:** `ctx.vessel.signal().latency` gives the light time in seconds.

**Data over the network (API 0.1.69, plan 119, ADR 0189).**

- With comms on, transmitted data waits in the vessel's radio. It goes out at the route's rate in kind priority order: `stock.command` (−1) first, then telemetry, voice, science, image and bulk.
- A data kind with a negative priority is a command kind: it still moves at 1 kbit/s over a commands-only link.
- Listen for `comms:data-delivered { vessel, item, kind, bits, time }` to react when your data arrives.
- A vessel with data storage can carry other vessels' data (store-and-forward) when it will reach a station first.

**Channels and licences (API 0.1.71, plan 120, ADR 0191).**

- **A band's channels:** give your band `channels: 8` and a `licence` price.
- **An antenna's channel:** your own antenna module returns `channel` and `encrypted` from its `antenna` hook. The stock one has `setChannel` and `setEncrypted` actions.
- **Licences:** data on a channel other than 0 needs `licence-buy`.
- **Interference:** links that share a band and a channel, and reach each other's receiver, lose 3 dB each.

**Suit radios and broadcasts (API 0.1.73, plan 121, ADR 0193).**

- **A suit radio:** `defineAntenna({ ..., band: 'stock.uhf', range: 1_500, suit: true })` on your suit part. A crewed vessel in sight relays it, within its own range rating. A crew member's `radio` ability stretches that range (a trait may scale it: `abilities: { radio: 1.2 }`).
- **Broadcasts:** a world first may be broadcast live with `comms-broadcast { milestone }` for an hour after it, when its vessel reaches the ground at 100 kbit/s or more. It pays half the milestone's reputation.

**Stored science and the science panel (API 0.1.74, plan 191, ADR 0194).**

- **`VesselSnapshot.science.stored`:** each science result aboard, as `{ item, subject, value, factor }`. Transmitting it credits `value × factor`.
- **The stock panel `stock.science`:** lists the experiments with a Run button each, and the stored results with Transmit and Discard each. Its two shortcuts run the next experiment that may run and transmit the best result. A panel of your own can read the same fields.
- **Buttons on a list row** (API 0.1.85, plan 231): a list item may carry `actions: [{ label, command }]`. Each is evaluated like a button, and a null command shows the button disabled.

## Catalogue categories (API 0.1.43, plan 069, ADR 0146)

The editor's part catalogue groups parts by category, and the categories are a registry: stock registers its nine (`stock.command`, `stock.tanks`, `stock.propulsion`, `stock.structural`, `stock.aero`, `stock.control`, `stock.landing`, `stock.thermal`, `stock.other`) the same way a mod adds its own:

```ts
ctx.categories.register(defineCategory({
	id: 'acme.solar',
	label: 'Solar',
	icon: { path: 'M4 6h16v12H4ZM4 12h16M12 6v12' },
	order: 450
}));
ctx.parts.register(definePart({ id: 'acme.panel', title: 'Solar panel', mass: 20, catalog: { category: 'acme.solar' } }));
```

- `order` places the tab on the rail, ascending: stock uses 100 (Command) to 800 (Thermal) in steps of 100, and Other is 10 000, always last. 450 sits between Structural and Aerodynamics; ties keep registration order.
- `icon` is the name of an icon in the game's own set (`'engine'`, `'tank'`, `'part'`, ...) or `{ path }`: SVG path data on a 24 x 24 grid, at most 1 024 characters of commands and numbers. The game draws it with its own stroke (1.7, round caps and joins, no fill), so draw lines, not filled shapes. A name the game does not know shows the plain part icon; your mod still loads.
- A part joins a category with `catalog: { category }`, and a module descriptor can imply one with `category` in `describe()`. Both take a category id or one of the nine short names (`'control'` means `stock.control`). A part that names a category nobody registered sits in Other.
- A category with no parts is not shown. Another mod can relabel or reorder yours with `definePatch({ target: 'category', ... })`.

## Achievements and milestones (API 0.1.44, plan 102, ADR 0147)

Each world records its firsts by itself: `launch`, `orbit`, `flyby`, `landing` and `return`, per body, and a crewed record when crew was aboard (`crewed-orbit:stock.home`). A first emits `milestone:reached { id, kind, body?, vessel, crewed, time }` on the sim's event bus, is saved with the world, and pays reputation when the world's economy is on. EVA, docking, stations, relays and sample returns join the list with the plans that bring those systems.

Achievements belong to the player, across worlds. Define one as data; it unlocks when any world records a first that matches:

```ts
ctx.achievements.register(defineAchievement({
	id: 'acme.moon-walker',
	label: 'Moon walker',
	description: 'Land on another body with crew aboard.',
	criteria: { milestone: 'landing', body: 'away', crewed: true }
}));
```

- `criteria.milestone` is one of the kinds above; `body` is `'home'`, `'away'` (any other body) or a body id; `crewed: true` asks for a crewed record. `achievementMatches(achievement, record, home)` is the same test the game runs.
- `hidden: true` keeps an achievement off the list until it is unlocked. Achievements teach and reward; none should be missable for good, and a world loaded later still unlocks what its records match.
- Unlocks live in the player's local profile (the Worlds screen exports and imports it).

## Stars and the home body (API 0.1.48, plan 122, ADR 0119)

- **A star** is a body with `star: true`: no surface (no terrain is asked for it), drawn emissive, and the renderer lights the system from it. The stock root is `stock.sun`; a system pack puts its own star at the root and its planets as children with an `orbit`.
- **The calendar** is read on the root (ADR 0141): give the star `calendar: { kind: 'fictional', home: '<your planet>' }` and the year is that planet's orbit, the day its solar day.
- **The home body** is the world's primary site's body, else the first body that is not a star and orbits a star or nothing (`homeBodyOf` in `@orbital/sdk`). Hosts read it from the sim (`sim.home`); do not take `bodies[0]`, which is the root.
- **Axial tilt** in the stock system is the inclination of the planet's orbit with the pole on +Y, so the planet's own sphere keeps the frame it always had; a pole of your own (`rotation.pole`, ADR 0145) works too.

## EVA parts (API 0.1.49, plan 109, ADR 0120)

- **A suit** is any part with a seat and `walk: { speed }`: `crew-eva` puts the member in a vessel of that one part, `crew-walk` walks it up to that speed. Give it a command module (so it rests on surface rails), stores for the crew (ADR 0181) and, if it flies, an engine on its own propellant.
- **A kept vessel** has a module with `keep: true`: it is never removed as resting debris. `plant-flag` spawns the first registered part with such a module beside a standing suit.
- A module's `onRecover` also runs when its suit boards a vessel: what it credits then goes into that vessel's sample locker and counts at the vessel's recovery.

### Hatches, ladders and the jetpack (API 0.1.82, plan 225, ADR 0209)

- **A hatch:** give a crewed part `hatch: { pos: [x, y, z], dir: [x, y, z] }` in its own frame. Crew step out 1 m along `dir`, and suits board within 2 m of that point. A part in the way blocks the hatch, and `crew-eva` says which one.
- **A ladder:** `ladder: { from, to, out }` is a segment in the part frame plus the side a suit hangs on. `crew-grab` latches a suit within 1 m, and `crew-climb` moves it along. Any part may carry one: the stock pod has a short one beside its hatch, and `stock.ladder` is a 2 m radial one.
- **The suit:** `walk: { speed, run, propellant }`. `run` is the running speed; `propellant` is the resource a member keeps between EVAs, topped up from the vessel when boarding.
- **The stock jetpack** is the module `stock.jetpack` (`{ thrust, isp, propellant }`). It is switched by its `setOn` action and pushes along the vessel's translation demand, the same input RCS reads.

## A second hills planet (API 0.1.51, plan 071, ADR 0121)

- **Its own continents:** `terrain: { kind: 'hills', seed: 11 }` gives the planet its own biome map and noise. Without a `seed` a later hills body takes the world's terrain seed mixed with its id (`hillsSeedOf`), so two planets never share continents; the home planet keeps the world's seed.
- **Air:** an `atmosphere` (`scaleHeight`, `surfacePressure`, `height`) now draws a sky from the surface, haze over the ground and a lit limb from orbit, and the light on the planet comes through it. Optical depth follows the surface pressure (101 325 Pa is the home planet's look).
- **Sea and shadows** come with the hills kind: water reflects the sky and the sun, and the terrain casts shadows near the camera.

## How a body looks (API 0.1.113, plan 381, ADR 0318)

`appearance` on a `defineBody` sets the colours and features the renderer, the map and the Create World art draw. It changes nothing in the physics.

```ts
appearance: {
	palette: ['#b0603a', '#7c3c25', '#d38c5c'], // main colour first, 1 to 6
	pattern: 'polar-caps', // mottled | polar-caps | lineae | volcanic | bands
	sky: '#d6a27a', // the colour light takes in the air
	haze: 0.35, // 0..1, dust or smog
	clouds: { color: '#eedcae', altitude: 48_000, opacity: 0.96 },
	rings: { inner: 7_700_000, outer: 12_600_000, color: '#d8c7a4', opacity: 0.7 }
}
```

- A `craters` body is drawn with its palette in the pattern. Far away it is a plain lit sphere with the same colours, and its ground pass is built only when it covers a few dozen pixels or holds the active vessel.
- A body without terrain and with `pattern: 'bands'` is a giant: bands, storms and its rings.
- A cloud deck hides the ground from orbit and fades out as the camera sinks below it.
- `sky` and `haze` colour the body's own air (on a `craters` body with an `atmosphere`).

The stock system's bodies are the examples (`mods/stock/src/bodies.ts`). They also show how to write orbits against the ecliptic and a planet's equator (`orbitAgainst`) and tilt a pole (`tiltedPole`).

## Dock panels (API 0.1.52, plan 112, ADR 0149)

A mod can add a panel to the flight dock. The view is data: each value is a pure function of the panel input, and a button or switch returns a command that the sim checks like any other.

```ts
ctx.panels.register(definePanel({
	id: 'acme.altimeter',
	title: 'Altimeter',
	icon: { path: 'M4 20h16M12 4v12' },
	order: 600,
	contexts: ['flight', 'map'],
	view: {
		kind: 'section',
		children: [
			{ kind: 'readout', label: 'Altitude', value: (i) => i.altitude, unit: 'm' },
			{ kind: 'sparkline', label: 'Speed', value: (i) => i.speed },
			{ kind: 'button', label: 'Stage', command: (i) => (i.vessel ? { type: 'stage', vessel: i.vessel.id } : null) }
		]
	},
	canvas: { height: 60, draw: (c, i) => { c.clear(); c.fillText(`${Math.round(i.time)} s`, 4, 14); } }
}));
```

- The input (`PanelInput`) holds the snapshot, the vessel the player flies, its altitude and speed relative to its body, the sim time, the body and delta-v (ADR 0288) and `world`, the World Query (plan 343). Selectors run ten times a second; keep them cheap.
- Nodes: `section` (`columns` 1 or 2), `readout` (a value or `null` for `[—]`), `meter` (0 to 1), `switch`, `button` (`tone` `primary` or `danger`), `pick` (plan 366: a button that arms a map pick; `command(input, { body, direction })` runs with the next map click on a body), `select`, `list`, `sparkline` (the game keeps the last `samples`, default 60), and (plan 332, ADR 0287) `tabs`, `progress`, `number` and `notice`; see `guides/vessel-pilot-api.md`, "Mod panel UIs".
- `canvas.draw` gets a `PanelCanvas` (clear, fill and stroke styles, paths, arcs, rectangles, text). It runs only while the panel is open. Mods import only `@orbital/sdk`: no DOM.
- A panel that throws shows "This panel stopped" with the message; the game and the other panels go on.
- The player adds and removes panels with the Panel library (the plus at the foot of the dock); `examples/mod-sample` has a complete panel.

## The World API: read the whole game, act on it, keep state (API 0.1.106, plan 343, ADR 0292)

Content registrars add things to the game; the World API is how your code *reads and changes the running world*. Systems (`defineSystem`) and autopilots (`defineAutopilot`) get it as their context (`ctx`), panels as `input.world`. Everything below comes from `@orbital/sdk`; `examples/mod-world-api` uses all of it and has a test.

### What can read what

| Code | Runs | Gets |
|---|---|---|
| Module hooks (`defineModule`) | per part, every step, in the sim | `ctx.world` (raw ECS for module state), `ctx.vessel` (capabilities) |
| Systems (`defineSystem`) | every step (`pre-physics`, `post-physics`), each game day (`world-tick`), or on events (`on`), in the sim | the whole `SystemContext`: `world`, `commands`, `store`, `notify`, `events`, `registries`, `rules`, `tick` |
| Autopilots (`defineAutopilot`) | per vessel at their rate, in the sim | `ctrl` (the `VesselPilot`) plus `ctx` (the same `ModContext`) as the last argument of `start` and `step` |
| Panels (`definePanel`) and keybindings | in the page, 10 Hz | `input` (snapshot, flown vessel, altitude, speed, body, delta-v) and `input.world` |

### World Query (`ctx.world`, `input.world`)

A read-only facade over the snapshot, in plain types that follow the protocol, not the ECS. "Get all vessels" is `ctx.world.vessels()`.

```ts
const w = ctx.world;
w.time; w.paused; w.day;                                   // sim time (s), the clock, the world-tick day
w.vessels();                                               // every vessel (WorldVessel[])
w.vessels({ type: 'probe', situation: 'landed', soi: 'stock.mun' });
w.vessels({ near: { of: myId, within: 2_000 }, noDebris: true, except: myId });
w.vessels({ owner: 'player' });                            // or an agency id
w.vessel(id); w.findVessel('Station'); w.nearest(myId, { noDebris: true });
w.distance(a, b);                                          // m, across SOIs too
w.parts(id);     // WorldPart[]: definition, modules (each module's snapshot), temperature, resources
w.resources(id); w.amount(id, 'stock.liquid-fuel');
w.crewOf(id); w.crew();                                    // roster: name, profession, level, status, vessel
w.orbit(id);                                               // OrbitalElements or null
w.comms(id);                                               // { to, control, rate, latency, route } or null
w.bodies(); w.body('stock.home');                          // radius, mu, atmosphereHeight, soi, parent, position
w.sites();                                                 // buildings and outposts per site
w.economy();                                               // { enabled, funds, science, reputation }
w.rule('stock.economy'); w.store('my-mod.log');            // any rule's value; any mod's store (read only)
w.snapshot;                                                // the protocol itself, for what the facade lacks
```

A `WorldVessel` has `id`, `name`, `type`, `owner`, `mode`, `situation`, `soi`, `position`/`velocity` (relative to `soi`), `absolute` (root frame), `altitude`, `radarAltitude`, `speed`, `parts`, `crew`, `controlled`, `orbit`, `periapsis`, `apoapsis`, `target`, `autopilot` and `stage`.

**Situations** (`VESSEL_SITUATIONS`): `prelaunch`, `landed`, `splashed`, `flying` (below the top of the air), `sub-orbital`, `orbiting`, `escaping` (open orbit, or apoapsis beyond the SOI). The sim sets `VesselSnapshot.situation`; `classifySituation` is the rule.

**Cost.** In the sim the query is built from a full snapshot the first time you read `ctx.world` at a sim time, then reused until the time moves or a mod command or store write changes something. A system that reads it every physics step pays a snapshot per step: prefer `world-tick`, event handlers (`on`), or a lower rate of your own.

### Commands (`ctx.commands`)

The sim's own commands, checked by the same handler as the player's keys and scripts. A mod is a program (ADR 0276): the player's override and the signal delay apply to it as to an autopilot. Each call returns the sim's `CommandResult`; a refusal says why.

```ts
const c = ctx.commands;
c.setTarget(id, { kind: 'vessel', id: other });            // or { kind: 'body', id: 'stock.mun' }, or null
c.stage(id); c.throttle(id, 0.5); c.sas(id, 'prograde');
c.actionGroup(id, 'stock.gear'); c.actionGroup(id, 'custom.1', true);
c.warp(100); c.warpTo(w.time + 3_600); c.warpTo({ kind: 'apoapsis', vessel: id });
c.placeNode(id, { time: t, prograde: 120, normal: 0, radial: 0 }); c.removeNode(id);
c.addAlarm({ name: 'Burn', time: t - 60 }); c.rename(id, 'Relay 3');
c.engage(id, 'my-mod.hover', { height: 50 }); c.disengage(id);
c.focus(id);                                               // the page switches to this vessel
c.spawn(design, placement); c.terminate(id);               // only while debug tools are allowed
c.send({ type: 'set-rcs', vessel: id, on: true });         // any allowed command
```

Allowed: vessel control (throttle, attitude, RCS, SAS, trim, staging, action groups and part actions, control part, transfers, flow locks), targets, warp and warp-to (within the world's warp limits), maneuver nodes, alarms, names and types, autopilots, program stop, antenna pointing, comms routes, data moves and transmissions, `mod-key`.
Only while debug tools are allowed (a sandbox world, or debug mode on in a world whose `stock.debug-tools` is `opt-in`): `load-vessel` (spawn), `terminate-vessel`, `recover-vessel`, `clear-debris` and the `debug-set-*` and `debug-cheat` commands.
Refused: everything that changes a career or the world's settings (economy, contracts, research, crew hiring, buildings, strategies, market, rules, pause, debug mode). A mod that wants to change a career defines content the player chooses (charges, contracts, strategies).

### Stores: your mod's saved state (`defineStore`, `ctx.store`)

```ts
export const Log = defineStore({
	id: 'my-mod.log',
	schema: z.object({ landings: z.int().min(0), lines: z.array(z.string()).max(20) }),
	initial: { landings: 0, lines: [] as string[] }
});
// setup: ctx.stores.register(Log);
// a system or autopilot of the same plugin:
ctx.store(Log).update((l) => ({ ...l, landings: l.landings + 1 }));
ctx.store(Log).get();
```

- Saved with the world (`SimSave.stores`) and in the snapshot (`snapshot.stores`, `input.world.store(id)`).
- `set` validates with the schema and refuses more than 64 KiB of JSON (`STORE_MAX_BYTES`): it throws a `RangeError` that names the field.
- Only the registering plugin's systems and autopilots may write; any code may read through the world query.
- On resume a value that no longer parses (you changed the schema) falls back to `initial`. Write a schema that accepts your old shape (`z.union`, `.catch`) when you want to keep it.

### Events (`SIM_EVENTS`, `EventMap`)

Every sim event is typed in `EventMap` and listed in `SIM_EVENTS` (`{ name, group, description, by? }`). Subscribe in a system with `on`, which gets the payload and the system's context:

```ts
ctx.systems.register(defineSystem({
	id: 'my-mod.watch',
	on: {
		'vessel:situation-changed': (e, ctx) => { if (e.to === 'landed') ctx.notify('Touchdown'); },
		'vessel:docked': (e, ctx) => ctx.store(Log).update(/* ... */),
		'objective:completed': (e, ctx) => { /* a contract or mission done */ }
	}
}));
```

`ctx.events.on` in `setup` works too, but the handler has no World API context. A handler that throws is skipped; the game goes on.

| Group | Events |
|---|---|
| vessel | `vessel:created`, `vessel:split`, `vessel:destroyed` (crash, burn-up, terminate, recovery: `reason`), `vessel:docked`, `vessel:undocked`, `vessel:mode-changed`, `vessel:soi-changed`, `vessel:situation-changed` (landing, splashdown, lift-off, orbit, escape), `vessel:maneuver-complete`, `vessel:target-lost`, `vessel:power-depleted`, `vessel:frozen`, `vessel:thawed` |
| flight | `stage:activated`, `part:damaged` (impact or heat), `part:failed`, `stock:engine-flameout`, `stock:parachute-deployed`, `stock:parachute-torn`, `range:violation`, `tether:attached`, `tether:released`, `tether:snapped` |
| program | `autopilot:ended`, `program:override`, `program:resumed`, `program:stopped`, `script:attached`, `script:detached` |
| world | `world:tick`, `world:rule-changed`, `world:entity-added`, `world:entity-removed`, `warp:limited`, `warp:stopped`, `warp:clamped`, `alarm:fired`, `building:ready`, `site:founded`, `site:joined`, `site:left`, `route:delivered` |
| career | `objective:completed`, `objective:failed`, `milestone:reached`, `economy:entry`, `discovery:reviewed` |
| crew | `crew:hired`, `crew:dismissed`, `crew:xp`, `crew:lost`, `crew:returned`, `crew:shortage`, `crew:resupplied`, `crew:g-loc` |
| science, comms | `science:result`, `science:credited`, `data:stored`, `data:dropped`, `comms:link-up`, `comms:link-down`, `comms:control-changed`, `comms:data-delivered` |
| mod | `mod:notice`, `mod:focus`, `mod:key` |

Add your own events by module augmentation of `EventMap` (see stock's `stock:engine-flameout`).

### Keybindings and notices

```ts
ctx.keybindings.register(defineKeybinding({
	id: 'my-mod.target-nearest',
	label: 'Target the nearest vessel',
	defaults: ['Alt+KeyN'],                 // key ids as Settings → Controls writes them; [] for unbound
	mode: 'flight',                         // or 'map'
	// optional: a command straight from the panel input; without it the sim emits `mod:key`
	command: (i) => (i.vessel ? { type: 'stage', vessel: i.vessel.id } : null)
}));
ctx.notify('Touchdown on the Mun', { tone: 'success', vessel: id, detail: '3.2 m/s' });
// a panel's own key (plan 366): `hidden: true` keeps it out of Controls → Mods; its command may
// carry `data` (up to 16 numbers, strings or booleans), which `mod:key` passes on
```

- The player rebinds mod keys under Settings → Controls → Mods. The game's own keys win: a mod key that is also a game key (or another mod's) is marked and does nothing until rebound. Most plain letters are taken; prefer an `Alt+` chord.
- A key without `command` sends `mod-key { key, vessel }`; handle it in a system's `on: { 'mod:key': ... }`.
- `notify` shows a toast on the page (`tone` `info`, `success`, `warning`, `danger`); with `vessel` only while the player flies that vessel. One toast per mod at a time: a new one replaces the last.

## Overlays: draw in the 3D view and the map (API 0.1.107, plan 347, ADR 0296)

A mod draws world-space shapes without three.js: it hands the game plain data and the renderer owns the meshes, on WebGL and WebGPU.

```ts
ctx.overlays.register(defineOverlay({
	id: 'my-mod.path',
	title: 'My path',                        // Settings → Interface lists it with a switch
	description: 'Where the probe is going.',
	defaultOn: true,
	// optional, page-side: shapes from the panel input, `rate` times a second (1 to 30, default 10)
	draw: (i) => (i.vessel ? [{ kind: 'marker', body: i.vessel.soi, frame: 'inertial', position: i.vessel.position, style: 'ring', color: '#ffffff' }] : [])
}));
// or from a sim system of the same plugin (replaces the last shapes; not saved):
ctx.overlays.set('my-mod.path', shapes, { seconds: 42 });   // meta: small numbers and strings for your panel
ctx.overlays.clear('my-mod.path');
// a panel reads them back: input.world.overlay('my-mod.path')?.meta
```

| Shape | Fields |
|---|---|
| `polyline` | `points` (≥ 2), `width` 1–8 px (default 2), `dash: { on, off }` in metres |
| `marker` | `position`, `style` `cross` \| `ring` \| `dot` \| `target`, `size` 6–64 px (default 20) |
| `label` | `position`, `text` (cut at 40 characters) |

Every shape has `body`, `frame` (`inertial`: offsets from the body centre in the shared inertial axes, like `WorldVessel.position`; `body-fixed`: in the body's own turning axes, for points on the ground), `color` (`#rrggbb` or `#rrggbbaa`), and optionally `depth` (`on-top`, the default, or `test` to hide behind terrain and parts), `views` (`flight`, `map`) and `vessel` (shown only while the player flies it). Budgets per overlay: 64 shapes, 4 096 points, 16 labels (`OVERLAY_LIMITS`); `set` returns what `clampOverlay` dropped, and an invalid shape is dropped, not thrown.

Facts for physics mods: `ctx.world.atmosphere(body, altitude)` (the sim's own air: density, pressure, temperature, speed of sound), `machDragFactor(mach)`, `WorldBody.angularVelocity` (the air turns with it), `ctx.world.groundHeight(body, position)` (the sim's terrain; null on the page) and `WorldVessel.mass` / `.dragArea` (C_d·A measured along the airflow as a running average over a few seconds in air, else an estimate along the vessel's axis).

### Walk-through: the Guidance Computer's landing path (`mods/guidance`)

The Guidance Computer's Landing tab (plan 372, ADR 0309; the Trajectories mod of plans 347 and 366 folded into it) is the reference example, `predict.ts` and `landing-path.ts`:

1. **`predict.ts`** is pure: RK4 for a point mass under gravity and drag, with drag on the velocity relative to the turning air (`v − Ω × r`), step length half the time to fall the current height, until the ground (`groundHeight` below 12 km), the SOI edge or 30 minutes. Each point is turned back into the body's axes at the time it is reached, so the arc lies on the ground the vessel will reach. It has its own tests, one against the range-safety conic in vacuum.
2. **The system** (`guidance.predictor`, post-physics) runs five times a second of sim time: `ctx.world.vessels({ situation: ['flying', 'sub-orbital'], owner: 'player', noDebris: true })` (two at most), a prediction for each, and `ctx.overlays.set` with the arc, a cross-hair and a "time · distance" label at the impact, all `body-fixed` and tagged with the vessel, plus `meta` (`time:<id>`, `distance:<id>`, `speed:<id>`, `error:<id>`, `heat:<id>`).
3. **When it shows** (`visibility`, pure and tested): the tab's **Predicted path** is `Auto` (default), `Always` or `Off`. Never on the ground, the pad or splashed, or when the path does not reach the ground. `Always` draws it in Flight and the map whenever it comes down, also in manual flight or under another program. `Auto`: not on a stable orbit or escaping, and not while another Guidance program flies the vessel (`WorldVessel.autopilot`; Land itself shows it). In Flight the arc fades in between 1 and 2 km above the ground; the map shows it whenever it comes down. Shapes carry `views`, so one prediction draws differently in each.
4. **How it looks** (`arcPieces`): a 2 px, 80 % arc in at most ten pieces, each coloured by its hottest point's √ρ·v³ (green, yellow, orange, red), nothing within 30 m of the vessel and faint over the first 600 m, so it never runs through the camera.
5. **The setting and the landing target** are stores (`guidance.path-settings` `{ mode }`, `guidance.landing-target`), saved with the world. The tab's select and buttons send `mod-key` with `data` through keybindings; the internal ones are `hidden`, so they stay out of Controls → Mods. The system's `on: { 'mod:key' }` applies them. The tab reads them with `i.world.store(id)` and the numbers with `i.world.overlay(id).meta`.
6. **The map pick**: the tab's `pick` node "Pick landing target on the map" arms a pick and opens the map; the player's next click on a body gives its command `{ body, direction }` (body-fixed), which sends `mod-key` with that point; the system stores it as latitude and longitude.
7. **The autopilot uses it**: Engage passes the target to `guidance.land` as `params.target`; an autopilot cannot read stores, so the panel hands it over.

It predicts a coast: engines are not in it. A tumbling vessel's drag area swings with its attitude, so its prediction settles once it holds an attitude (SAS) or after a few seconds of the average.

## Missions and mission packs (API 0.1.53, plan 100, ADR 0151)

A mission is a tree of objectives (the stock primitives: `stock.reach-altitude`, `stock.reach-orbit`, `stock.flyby`, `stock.enter-soi`, `stock.land`, `stock.return-home`) with words around it:

```ts
ctx.missions.register(defineMission({
	id: 'acme.relay-to-cinder',
	title: 'Relay to Cinder',
	briefing: "Take the relay into Cinder's sphere of influence.",
	debriefing: 'The relay reached Cinder.',
	objectives: { objective: 'stock.flyby', params: { body: 'stock.cinder' } },
	prerequisites: ['stock.orbit'],
	next: ['acme.relay-landing']
}));
```

- `prerequisites` must be done before the mission can start; `next` missions start by themselves when this one is done (a story line). Any other mission starts from the Missions panel of the flight dock.
- The stock main line (`line: 'stock.main'`) runs First launch, Into space, Orbit, To the Moon, Landing on the Moon, Home from the Moon.

A **mission pack** is a scenario: Create World offers it, and the world's first flight starts from it.

```ts
ctx.scenarios.register(defineScenario({
	id: 'acme.relay-start',
	title: 'Relay in orbit',
	description: 'Start with a probe in a 100 km orbit.',
	preset: 'stock.career',
	vessels: [{ name: 'Relay 1', design: relayDesign, orbit: { body: 'stock.home', altitude: 100_000 } }],
	missions: ['acme.relay-to-cinder']
}));
```

- A vessel either has an `orbit` (circular, equatorial, at that altitude) or `site: true` (on the site's pad). The first one is the vessel the player flies. `examples/mod-sample` has a complete pack.

## Tech nodes (API 0.1.55, plan 105, ADR 0154)

A world with the `stock.tech-tree` rule on (Career) locks every part some tech node unlocks until a node that unlocks it is researched. Define a node as data:

```ts
ctx.techNodes.register(defineTechNode({
	id: 'acme.tech.ion',
	label: 'Ion propulsion',
	tier: 3,
	cost: 180,
	requires: ['stock.tech.propulsion'],
	milestone: 'flyby:stock.cinder',
	unlocks: ['acme.ion-engine', 'acme.xenon-tank']
}));
```

- `research { node }` spends `cost` science when every `requires` node is researched and the world has the `milestone` (an id from the section above); the refusal names what is missing. A node of cost 0 with no requirement is researched from the start.
- A part may also name its node with `techNode` on the part definition; a part no node unlocks is never locked. When several nodes unlock a part, any one of them is enough.
- A locked part is a no-go in the Hangar's verdict, the Launch screen refuses the design, and the sim refuses `load-vessel` with `"Title" is locked: research "Node" first`. The R&D screen (the Space Center's lab) shows the tree by tier.
- Pace a node by the science of the flights that reach it: `mods/stock/test/tech.test.ts` measures the stock bands from the science model (`subjectCap`). Nodes are not patchable yet.

## Patching another mod's data (API 0.1.26, plan 079, ADRs 0104 and 0170)

A mod can change data another mod registered (a part's mass, an engine's thrust, a resource's density, a body's field) without replacing it. Register a `definePatch` in `setup`:

```ts
import { definePatch, kN } from '@orbital/sdk';

export const PatchEngineThrust = definePatch({
	id: 'sample.engine-lv-thrust',
	target: 'part', // 'part' | 'resource' | 'body'
	select: { id: 'stock.engine-lv' }, // or { ids: [...] }, { tag: '...' }, { where: (part) => part.mass > 1000 }
	ops: [{ op: 'set', path: 'modules.stock.engine.thrust', value: kN(230) }]
});
// in setup: ctx.patches.register(PatchEngineThrust);
```

- **Paths** are dot-separated: `mass`, `visual.palette.primary`, `attach.top.pos.1` (a number indexes an array). A part's module config is `modules.<moduleId>.<field>`: the module is found by its id, never by its place in the list. `modules.<moduleId>` is the whole config.
- **Operations:** `set` (makes missing parent objects), `merge` (shallow object merge), `remove` (a key, an array element, or a whole module with `modules.<moduleId>`; a missing path is an error), `append` (to an array; on `modules` it adds a `[moduleId, config]`), `insert` (with an `index`).
- **Order.** Patches apply once, after every plugin's `setup` and before the parts are checked against their modules. `after: ['other-mod']` / `before: ['other-mod']` put yours after or before every patch of those plugins (unknown ids are ignored); `priority` (default 0, lower first) orders what they leave open; then plugin boot order, then registration order. Constraints that form a cycle switch the patches in it off.
- **Validation.** The patched entry is checked again by its schema, and a part's module configs by their modules' own schemas. If the result is invalid for any selected entry, the whole patch is off and every entry keeps the value it had; the reason names the entry. A bad patch never stops the game or your other content.
- **What the player sees.** `/mods` lists, under each running mod, each field its patches changed: "stock.engine-lv · modules.stock.engine.thrust · 215,000 → 230,000, patched by sample", or why a patch did not apply. In tests, `loadPlugins(...).report.patches` has the same list (`applied`, `changes`, `disabled`) and `report.provenance[kind][entryId][path]` names every plugin that set a field, the registering one first. `examples/mod-sample/test/sample.test.ts` checks the sample's patch from the built package.
- Patched values are data, not saved: they are applied again at every load from the mods that are on.

## World rules and presets (API 0.1.27, plan 078, ADRs 0094 and 0111)

A world is created from a **preset** (Sandbox, Science, Career, ...) and keeps a value for every **rule**. Stock's rules and presets are in `mods/stock/src/rules.ts`; yours work the same way:

```ts
import { definePreset, defineRule, definePlugin } from '@orbital/sdk';

export const RuleWeather = defineRule({
	id: 'acme.weather',
	label: 'Weather',
	category: 'environment',
	type: 'enum', // or 'boolean', or 'number' with min, max and optional integer
	values: ['calm', 'normal', 'stormy'],
	default: 'normal',
	presets: { 'stock.sandbox': 'calm' }, // value per preset id
	// which way is easier (plan 230): during play a world may only change the rule this way
	easier: ['stormy', 'normal', 'calm'], // enum: hardest first; boolean: the easier value; number: 'higher' | 'lower'
	changeable: true // false = identity: fixed when the world is created
});
// Without `easier` a changeable rule is fixed once the world is made (outside debug mode). World
// settings shows every changeable rule and closes the harder choices with the reason.
export const PresetStorm = definePreset({
	id: 'acme.storm-career',
	label: 'Stormy career',
	values: { 'stock.economy': true, 'acme.weather': 'stormy' }
});

definePlugin({
	meta,
	setup(ctx) {
		ctx.rules.register(RuleWeather);
		ctx.presets.register(PresetStorm);
	}
});
```

- **Values.** A new world stores the value of every loaded rule: its own value if Create World set one, else the preset's `values`, else the rule's `presets[presetId]`, else `default`. A world that predates your rule gets it the same way at its next load. A value that does not fit the type is refused when the mod loads (for defaults and preset values) or when the world loads.
- **Reading.** A system reads `ctx.rules.get('acme.weather')` in `update` (undefined when no loaded mod defines the id); the HUD reads `snapshot.rules`. It is a map read, so check it every step if you like.
- **Changing.** The player (or a script) sends `{ type: 'set-rule', rule, value }`; it is refused for identity rules (`identity rule`, also for `system`, `variant`, `gravityModel`, `seed`, `primarySite`), unknown ids and wrong values, and otherwise applies from the next step, appends `{ time, rule, from, to }` to the world's changelog and emits `world:rule-changed`.
- **Your mod removed.** Its rule values stay in the save (`sim.unknownRules` lists them) and come back when the mod does.

## Costs, prices and charges (API 0.1.30, plan 095, ADR 0113)

- **A part's cost** is `cost` on the part (funds for the dry part); a resource's `price` is funds per unit, and a part's contents are paid at launch from it. Stock computes its numbers from one rule in `mods/stock/src/costs.ts` (dry mass × class rate); a part without `cost` costs 0, and the Hangar says "no cost set". Both are data, so another mod can patch them (`definePatch`).
- **Recurring income and costs** are charges: `ctx.charges.register(defineCharge({ id, label, currency: 'funds', amount: -1_500, everyDays: 30, when?: { rule, equals }, scaleBy?: ['stock.cost-multiplier'] }))`. On every world tick whose day is a multiple of `everyDays` the sim writes `amount` (times the numeric rules in `scaleBy`) to the ledger with your charge id as the cause, while `when` holds. Nothing is written while `stock.economy` is off.
- **Reading the ledger:** listen to `economy:entry` (`{ time, currency, amount, cause, ref? }`); the HUD reads `snapshot.economy`. `designCost(design, registries)` gives a design's launch cost, and `projectBalances(...)` projects the charges over N days.
- Launching (`load-vessel`) pays the design's cost and is refused when funds are short; `recover-vessel` pays back the value of what is left of a landed vessel at rest, times a distance factor (`recoveryFactor`), and removes it.

## Commodities and recipes (API 0.1.61, plan 097, ADR 0124)

`ctx.commodities.register(defineCommodity({ id, label, unit, basePrice, resource?, market }))` adds a commodity. `market` is `'fixed'` (a price, no trade) or `{ target, elasticity, cap, floor, ceiling, relaxDays }`: the world holds `target` units at the base price, `elasticity` sets how hard the price answers `target / stock`, `cap` is the largest move per day, `floor` and `ceiling` bound the price as fractions of base, and `relaxDays` is how fast world demand brings the stock back. A commodity with a `resource` prices that resource's launch contents while markets are open (Career): a launch takes it from the launch site's storage first and buys the rest. `ctx.recipes.register(defineRecipe({ id, label, building, inputs, outputs }))` makes a building kind turn inputs into outputs per day at production factor 1; the building level's `production` capacity multiplies it and its `storage` capacity bounds what a site holds. Stock: `stock.liquid-fuel`, `stock.oxidizer` (traded) and five fixed services; `stock.propellant-synthesis` in `stock.propellant-plant`. Commands `market-buy` and `market-sell { commodity, amount, site }`.

## N-body worlds and DE440 (API 0.1.68, plan 125, ADR 0122)

A world's `gravityModel` may be `n-body`: vessels are integrated against every body (the bodies keep their paths), and maneuver nodes, the map and scripts' predictions use the n-body provider (`createTrajectoryProvider('n-body', bodies)`, or `trajectoryFor(tagTrajectoryModel(list, 'n-body'))`). Time warp is capped at 1e5× and held lower by an integration budget (event `warp:limited`). A body can name its NAIF id (`naif: 399`); a host that passes JPL's DE440 asset to `createSim({ ephemeris })` moves such bodies on it within the asset's span. `tools/pack-de440.ts` packs an SPK file into that asset.

## Bases on other bodies (API 0.1.64, plan 128, ADR 0125)

A building can say where it stands: `placement: 'home'` (the home planet only) or `'off-world'` (other bodies only); without it, anywhere. `canPlace` refuses with the code `placement`. A part with the `stock.base-kit` module founds a base where it lands (`deploy-base`); a vessel landed in a base's flat zone joins it with `join-site`, and its `stock.drill` modules (`{ perDay }`) fill the site's storage with `stock.ice` on each world tick. A recipe's `inputs` other than `power` are taken from the site's storage, so a recipe runs only as far as its inputs allow (stock: `stock.ice-electrolysis` in `stock.isru-plant`). Craters bodies flatten round their sites like hills bodies do.

## Range safety (API 0.1.56, plan 127, ADR 0155)

With `stock.range-safety` at `cost` (Career) or `hard`, a site has a safe launch fan over its water and every spent stage is judged when it separates: on land or within 50 km of a site it costs a penalty (`cost`) or the `stage` command is refused (`hard`). A mod part that separates is judged when its module's `describe` returns a `separator` (as `stock.decoupler` does); nothing else is needed. Listen to `range:violation` for the drops and ascent azimuths that broke the range; `safeFan`, `conicImpact` and `nominalDrops` are in `@orbital/core` (not re-exported by the SDK yet), the functions the game uses for the fan and the drops.

## Failure modes (API 0.1.57, plan 130, ADR 0156)

With the `stock.reliability` rule on (the Career (engineering) preset), parts can fail. A failure mode is data on a module id:

```ts
ctx.failureModes.register(defineFailureMode({
	id: 'acme.ion-flameout',
	label: 'Ion flameout',
	module: 'acme.ion-engine',
	trigger: 'stage',
	chance: 0.06,
	repairable: true
}));
```

- `trigger: 'stage'` draws when a part with the module is staged; `'launch'` when its vessel is loaded. `chance` is per trial for a new part model at the standard grade; experience (`1 / (1 + trials / 5)`, at least 0.2), the grade, an engineer aboard (× 0.75) and bought fixes (× 0.5 each, at most 3) scale it: `trialChance` and `modelReliability` are the game's formulas.
- A failed module stops working by itself: its `update`, `updateOnRails`, `onStage` and `controlAuthority` are not called, its actions are refused and described as `Failed: <label>`, and a failed antenna is off. Your module needs no code for it.
- Listen to `part:failed { vessel, part, module, mode, time }`. Draws come from the sim's own `reliability` stream, so a replay fails the same way.

## Wheels, flaps and aircraft (API 0.1.66, plan 063, ADR 0161)

- **A wheel** is a module collider with a `wheel` field: `colliders: (config, state) => [{ offset, halfExtents, wheel: { rolling: 0.02, grip: 0.8, brake: state.brakes ? 1 : 0, steer: 0.35 } }]`. Its box is frictionless; the sim applies rolling resistance, side grip and brakes at its ground contact, rolling along the part's +Y (the nose of a level craft), steered by the yaw demand times `steer` (rad). `stock.wheel` and `stock.wheel-steer` (`ModuleWheel`) are examples; hang them radially under a fuselage (radial angle π/2 points down for a craft with +Z up).
- **Flaps**: the stock wing takes `flapLift`, `flapDrag` and `flapStall` (degrees) and gets a `Flaps` mode action (up, half, full) in the `stock.flaps` group.
- **Aircraft**: a design with `aircraft: true` rolls out to a runway (the Launch screen pairs aircraft with runways and the rest with pads) and starts level, nose north. Build a runway in the Space Center first: the Legacy layout has none.

## Buildings (API 0.1.36, plan 090, ADR 0115)

`ctx.buildings.register(defineBuilding({ id, label, size: { w, d }, entrances, levels, provides, bodies?, hazardRadius?, visual }))` adds a building kind. Sizes are in **10 m cells** (`w` east, `d` north at rotation 0); `entrances` are cells on the footprint edge with the side they open to (`{ i: 1, j: 0, side: 'south' }`); `levels` carry `cost`, `buildDays`, `upkeep`, `power` and `capacity` per capability (`launch-pad`, `hangar`, `comms-node`, ...); `provides` lists the capabilities; `hazardRadius` keeps other buildings that many metres from the footprint centre. Stock's kinds are in `mods/stock/src/buildings.ts`.

Where a building may go is `canPlace(site, registries.buildings, kind, cell, rotation)` from the SDK: it returns `{ ok: true, roads }` (the road cells that connect every entrance) or the reasons (`overlap`, `outside-zone`, `hazard`, `no-road`, `body`, `unknown-kind`). The sim's `place-building` command uses the same function. A building is data, so another mod can patch it (`definePatch({ target: 'building', ... })`).

**Levels, construction and upkeep (API 0.1.58, plan 096, ADR 0123).** In a world with the economy on (Career), `place-building` pays level 1's `cost` and the building is `building` until its `readyDay` (`buildDays` world-tick days later); `upgrade-building { site, id }` pays the next level's cost and the building stays `upgrading` at its old level until done. A building under construction provides nothing; an upgrading one works at its current level. Each level's `upkeep` is charged every 30 days (cause `economy.upkeep`, the building id as `ref`). In Sandbox and the Legacy world all of this is free and immediate. `capacity` keys are the ones core lists in `CAPACITY` (`hangar` parts, `launch-pad` t, `runway` m, `crew`, `mission-control`, `comms-node`, `lab`, `admin`, `storage`, `production`); a site's value is the highest over its working buildings (`siteCapacity`), and a site with no building providing a key has no limit for it. `capacityUpgrade(registries.buildings, key, need)` names the cheapest level that meets a need ("Hangar level 2: 120 parts"). A level raises capacity only: no key may gate a flight tool (`FLIGHT_TOOLS`). The `building:ready` event fires when work is done.


### Branch HQ (API 0.1.87, plan 236, ADR 0229)

A building that provides `branch-hq` is what founding a branch builds: its level 1 `cost` and `buildDays` are the founding cost and time, and the player cannot place it. Stock's is `stock.branch-hq`; a mod may replace it with a patch or register its own (the first one registered is used). Until it is built, a branch takes no other building.

### Build menu categories (API 0.1.84, plan 235, ADR 0227)

A building names its build-menu row with `category` (a category id) and may carry a one-line `description` for its card. The rows are categories of the same registry as the Hangar's, with `scope: 'buildings'`; stock has `stock.launch`, `stock.comms`, `stock.science`, `stock.crew`, `stock.administration`, `stock.production`, `stock.infrastructure` and `stock.other-buildings` (Other, last). A mod adds its own row:

```ts
ctx.categories.register(
	defineCategory({ id: 'mymod.power', label: 'Power', icon: { path: 'M13 2 L4 14 H11 L10 22 L20 9 H13 Z' }, order: 650, scope: 'buildings' })
);
ctx.buildings.register(defineBuilding({ /* ... */ category: 'mymod.power', description: 'Solar power for the site.' }));
```

A building without `category`, or with an id that is not a registered buildings-scope category, lands in Other. The card's picture is drawn from the building's `visual` generator; an asset visual shows the row's icon.
## Saves (API 0.1.12, ADR 0050)

A flight is saved as plain JSON: the world (every module's `state`) plus the sim's clock and bodies. So a module's `state` must be plain, JSON-compatible data (numbers that are finite, strings, booleans, arrays, plain objects; no `undefined` meaning something, no `Map`/`Set`/typed arrays, no functions), and anything a module needs between steps belongs in `state`, never in a closure or a module-level variable: it would be lost on load. A save lists the plugins that were loaded; loading refuses it when a plugin is missing (or a part or module id it uses is gone) and says which. Keep ids stable across releases, and when a new version changes the shape of a module's `state`, read the old shape in `update`/`snapshot` defensively or ask for a save-format migration (an ADR and a bump of `SIM_SAVE_VERSION`).

## 6. Testing a mod

**The developer tools** (main menu → Developer, plan 375) boot the same plugins a world does, with your installed mods. A switch also boots the ones turned off.
- **Mods** is the loader log of the last page load:
  - the boot order;
  - each mod's result, and for a failure its kind (API version, dependency, code, setup threw, invalid content, assets) with the error's stack;
  - every patch and what it changed or why it failed;
  - what each mod registered, per kind;
  - models and images that failed to load.
  Copy it as text or download it as JSON for a bug report.
- **Parts** and **Crew** name the mod that registered each item and the mods that patched it, with the changes, and filter by mod.
- **Blueprints** checks every registered blueprint and opens it in the sandbox **Hangar**, which needs no world.


```ts
import { loadPlugins } from '@orbital/sdk';
const { registries, report } = loadPlugins([Stock]);
expect(report.registered.part.map((e) => e.id)).toContain('stock.engine-lv');
```

`loadPlugins` validates schemas and cross-checks every part's module configs, so bad data fails the boot with the part and module named. To unit-test a hook, build a `ModuleContext` from `createWorld()` and `createEventBus()` (both exported by the SDK for this), the loaded `registries`, the module's parsed config, `module.state(config)` and a recording `vessel` stub; see `mods/stock/test/helpers.ts` (`fakeVessel`). To test with a real sim, `@orbital/sim`'s `createSim({ plugins: [Stock, YourMod], backendFactory })` is a test dependency, not something a mod imports in `src`.

## 7. Ship your mod (runtime loading, API 0.1.15, ADR 0057)

> **API 0.1.16 (plan 023).** Make your engine show on the HUD throttle gauge by returning `throttle` (0..1, from your module state) in `describe().engine`; make a wing count in the editor's stability read-out by returning `lift: { area, liftSlope, crossflow, centre }`; choose the catalogue category of a part with `category` (for example `'control'`). Without them a mod part still works: the gauge shows the page's own throttle, there is no lift and the part lands in the category its engine, separator, store or control source implies, else "Other". See `apps/web/src/lib/mod-awareness.test.ts` for a test mod.

> **API 0.1.22 (plan 034).** Place a part yourself with `catalog: { category, order }` on the part definition: `category` (one of the nine ids above, `'other'` included, or since API 0.1.41 a registered category id, see [Catalogue categories](#catalogue-categories-api-0141-plan-069-adr-0146)) beats whatever the modules imply and suits a part with no module; `order` (default 0, ascending) sorts it in the catalogue, so a mod's parts can come first. The trip planner of the VAB lists a trip to every body of your mod that orbits the home planet (a `defineBody` with `parent` and `orbit`) with no extra data.

A mod outside the repo is a folder with a manifest and a source file; `examples/mod-sample` is a complete one (a part, a module that keeps its state in the world, a script).

```
my-mod/
  mod.json      { "id": "acme.mod", "version": "1.0.0", "api": "^0.1", "title": "...", "author": "...", "licence": "MIT", "dependencies": { "stock": "*" } }
  src/index.ts  default-exports definePlugin({ meta: { id: 'acme.mod', version: '1.0.0', api: '^0.1' }, depends: ['stock'], setup(ctx) { ... } })
```

- `mod.json` and `meta` must agree on `id`, `version` and `api` (the loader checks and names the mismatch). `dependencies` lists plugin ids with version ranges; `stock` is one. Put the same ids in `depends` (ids are enough: you cannot import another mod's code, only its ids).
- `licence` (optional, API 0.1.28, plan 075) states your mod's licence as an SPDX id or expression (`MIT`, `Apache-2.0`, `MIT OR Apache-2.0`, `LicenseRef-…`; at most 64 characters). The mod manager shows it in the installed list and the trust prompt, and "not stated" without one. Text that is not an SPDX expression is refused at install with the field named. The game itself is Apache-2.0 (ADR 0106); your mod may use any licence.
- Import only from `@orbital/sdk`. The build replaces that import by the SDK the game provides, so your bundle has no copy of it and uses the game's one `z`. To use a module of another plugin in a part, name it by id and declare its config shape with `declare module '@orbital/sdk' { interface ModuleMap { 'stock.resource-container': { ... } } }`, as the sample does.
- Build: `bun run tools/mod-build/build-mod.ts my-mod` writes `my-mod/dist/<id>-<version>.orbital-mod.json`: one JSON file with the manifest, the bundled code and a SHA-256 of the code. (In this repo `bun run build` inside `examples/mod-sample` does the same.)
- Install: open **Mods** on the start page, choose the file (or paste an https address of the file; the server must allow CORS), read the trust prompt and confirm. Nothing in the package runs before that. A mod is code with the page's own access (saves, storage, network): say plainly in your README what yours does. Enable, disable and remove it in the same list; **Reload to apply** restarts the page with the new set.
- What can go wrong, and what the player sees: a package that is not valid or was edited (refused with the reason), another API range (not loaded: "requires mod API ..."), a missing dependency, a plugin or part id that another mod or stock already owns (names both), a `setup` that throws (its message). One failing mod never stops the game or the other mods.
- Looks: a part's `visual.kind` selects one of the game's generators (`tank`, `capsule`, `engine`, ...) with your `palette` and `params`. A mod cannot add geometry or shader code, but it can ship a model: see "Models in your package" below. A model's standard materials draw the same on the WebGL renderer and the WebGPU one (plan 261).
- Test it the way the game loads it: `examples/mod-sample/test/sample.test.ts` builds the package, reads it with `parseModPackage`, loads it with `resolveMods(..., { importModule: importModBundle })` after `installModSdk(sdk)` and flies it in a sim.
- Saves list the mods in use (`id` and `version`). Keep ids stable; a save that needs a mod that is off, failed or removed says which.

### Models in your package (API 0.1.20, plan 051, ADR 0076)

A part can be drawn from a binary glTF (`.glb`) that travels inside the package, so a mod is not limited to the stock generators. `examples/mod-sample` has one: the `Sample Spike Engine`.

```ts
visual: {
	kind: 'engine',                       // the generator that draws it if the model cannot load
	asset: 'models/spike-engine.glb',     // a file in your package
	plume: { module: 'stock.engine', nozzle: [0, -0.5, 0], exitRadius: 0.5, length: 5 },
	articulation: { module: 'stock.engine', field: 'gimbal', mode: 'gimbal' }
}
```

- **Ship it.** Put `.glb` files under `my-mod/assets/` (packed at their path inside that folder), or add `my-mod/assets.ts` whose default export is a function returning `{ 'models/x.glb': bytes }`; the sample generates its model there with `tools/mod-build/glb.ts` (a small GLB and PNG writer), so it needs no binary art. The package then has `formatVersion` 2 and an `assets` table; every file has its own SHA-256 and the package fingerprint covers them, so a changed byte means "install it again to review it". A package without models stays format 1.
- **Images** (API 0.1.111, plan 375): `.png` and `.webp` files under `assets/` are packed too (format 3), at most 512 KB each; they are crew portraits for now (see "How crew look and move").
- **Limits** (checked at install, before the prompt, and named by file): models are `.glb` (glTF 2.0 binary) only; 2 MiB per file, 6 MiB and 32 files per package; at most 50 000 triangles, 32 mesh nodes (draw calls), 8 textures, 4 animations and 20 000 keyframes per model; textures PNG, JPEG or KTX2 (`KHR_texture_basisu`, API 0.1.62) embedded in the file; no external or data URIs; no Draco, Meshopt, WebP or AVIF (export plain triangles). A part whose `visual.asset` names a file your package does not carry makes the mod fail to load with the part and file named.
- **Author in the part frame.** Origin at the part's centre, +Y up, metres, the same frame as `shape` and `attach`. The model should sit inside the shape, and its faces should be where the attach nodes are (`top` at the highest face, `bottom` at the lowest). The game does not rescale or move it; where it does not fit (sticks out by more than 5 cm or a tenth of the length, far smaller than the shape, a node off its face) it logs a warning once per part on the console.
- **Moving parts.** Name a node `moving` and give the visual an `articulation`: the node turns about its own origin (put the origin at the gimbal point); a gimballed engine's plume follows it.
- **Folding out** (API 0.1.62, plan 065, ADR 0160). With `deploy: { module, flag, seconds, clip }` the model plays its glTF animation `clip` (default `deploy`, else its first animation) from closed to open as the module's flag turns on, over `seconds`, exactly as a generated part animates; export the clip from closed (time 0) to open (its end).
- **Far models** (API 0.1.62). `lods: [{ asset: 'models/leg-far.glb', distance: 60 }]` (one to three, distances increasing, m from the camera) draws a lighter model of the same part frame beyond each distance; each file is checked like `asset`. The plume, the moving node and the clip belong to the base model.
- **Palette on a model** (API 0.1.62). `materials: { hull: 'primary', trim: 'accent' }` sets the base colour of each named glTF material to that slot of the part's `palette`.
- **Plume, glow, shadows, icon.** The engine plume (`plume`), temperature glow and shadows work as for generated parts, and the catalogue icon is rendered from your model. Materials are the glTF's own (PBR metallic-roughness, base colour texture) unless `materials` maps them to palette slots.
- **If it fails.** A model that cannot be parsed is reported on the console and the part is drawn by the generator named in `kind`, so keep `kind` meaningful (an engine says `engine`).
- **Test it the way the game does.** `packages/renderer/test/mod-sample-asset.test.ts` builds the sample, parses and resolves it, hands the bytes to `GltfPartProvider` and checks the bounds, the pivot and the plume; copy it for your model.

## Open items

- `defineSystem` (per-step logic over the world, phases `pre-physics`/`post-physics`, and once per game day `world-tick`, API 0.1.29, plan 082): see "The World API" above (plan 343) and `examples/mod-world-api`. A world-tick system reads `ctx.tick.day` and draws only from `ctx.tick.rng`: it gets its own stream, which no other mod's system can disturb, and it reads no clock. A module that keeps working while its vessel is on rails can declare `background(ctx, dt)`: one closed form over the elapsed time (for example `state.charge += rate * dt`), run on each tick, at wake and before a save, in place of `updateOnRails`. See `packages/sim/test/world-tick.test.ts` for a battery and a world system. The stock solar panel (`mods/stock/src/solar.ts`, plan 190) is the stock example. One function serves as both `update` and `background`, so flight and rails charge the same:

```ts
function charge(ctx, dt) {
	if (ctx.state.deployed) ctx.vessel.resources.deposit(ElectricCharge.id, ctx.config.rate * dt);
}
export const ModuleSolarPanel = defineModule({ id: 'stock.solar-panel', /* … */ update: charge, background: charge });
```
- The HUD's throttle gauge still reads the stock engine's snapshot (a mod engine falls back to the page's own throttle display); mod-supplied VAB categories are plan 029.
- New renderer generators from a mod (executable render code), KTX2 textures, deploy animations in models and a hosted mod repository are not built (drafts 040 and 065).

## Blueprints (plan 285)

A blueprint is a ready-made vessel the Hangar's Library offers under "Mod":

```ts
ctx.blueprints.register(
	defineBlueprint({
		id: 'acme.pebble',
		title: 'Pebble probe',
		goal: 'orbit', // orbit | moon | planet | station | surface
		crew: 0,
		summary: 'A probe core on a small tank.',
		design // a VesselDesign, as the Hangar saves it (Export in the vessel library)
	})
);
```

The Library shows its picture, goal and crew, parts, mass, Δv and liftoff TWR, and loads it into the Hangar.

Since API 0.1.112 (ADR 0316) stock registers the game's own blueprints the same way: the learn examples and the famous missions, with ids such as `stock.two-stage` and `stock.kronos-selene`.
- `collection: 'learn'` or `'missions'` files a card beside them. Without it, a card goes under "Mod".
- `goal` may also be `deep-space`.
- Stock's designs are generated from the Hangar's builders (`apps/web/scripts/bake-stock-blueprints.ts`), and a test keeps them equal.
- Developer → Blueprints checks every registered blueprint and opens it in the sandbox Hangar.
