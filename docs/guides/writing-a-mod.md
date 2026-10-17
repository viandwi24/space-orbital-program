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
- Players can also make custom groups in a design (slots 1 to 10, on the number pad by default); they call your actions the same way.

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
- `visual.plume.nozzles` (API 0.1.23, optional, 2 to 9 points in the part frame) gives an engine one plume per bell: list the exit centre of each; `nozzle` stays the thrust centre (dust, ground light and the exhaust trail use it) and `exitRadius` and `length` apply to every bell. The `engine-cluster` generator draws `params.bells` bells on a ring of radius `params.ring` with exit radius `params.bellExit` (stock's `stock.engine-cluster` is the example); an asset model lists its own bell positions in `nozzles`.
  - `visual.deploy` animates a part from module state: `{ module, flag, seconds? }` reads the boolean `flag` of that module's snapshot (`stock.landing-leg` `deployed`). The stock legs draw four feet where the module's colliders are (a test pins `spread`, `drop` and `footSize` to the module defaults).
  - Explosions, burn-up, staging puffs and re-entry glow need nothing from the mod: the renderer recognises a part that disappears or a vessel that splits from successive snapshots and draws glow from `PartSnapshot.temperature`.
- `impactTolerance` (m/s, optional, default 6): ground impact speed above which the part breaks off the vessel; above twice it, the part is destroyed. The sim reports both as the `part:damaged` event (`{ vessel, part, definition, speed, outcome, cause: 'impact' }`). Stock: pod 10, tanks 5, engine 4, legs 12.
- `maxTemperature` (K, optional, default 1000): skin temperature above which re-entry heating destroys the part (`part:damaged` with `cause: 'overheat'` and `temperature`). Stock: tanks 900, pod/wheel/decoupler/legs 1000, engine 1800, heat shield 3000. Parts carry a `temperature` in the snapshot.
- Attach nodes: stack parts have `top` (+Y) and `bottom` (-Y) on the axis, `dir` pointing away from the part.
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

**The ground of a body (API 0.1.18, ADR 0067).** `terrain` names the kind of ground the body has: `{ kind: 'hills' }` (the home planet's ridged terrain, for the first body: the launch site stands on its flat zone at latitude 0, longitude 0) or `{ kind: 'craters', seed?: 0..999 }` (the stock moon's cratered regolith with its landing plain at latitude 0, longitude 0; another `seed` is another set of craters, rims and hills, so a third airless body with its own look is one line of data). A body without `terrain` is a smooth sphere, whatever its parent or atmosphere. The kind decides the sim's ground (`createBodyTerrainField`) and what the renderer draws; a kind is code in core and the renderer, so a mod picks one and does not supply a height function. Both kinds are drawn on any body after the first (plan 059, ADR 0090): a second planet with `{ kind: 'hills' }` is a globe with the home planet's continents seen from orbit and the hills the sim stands vessels on near the ground, with or without an `atmosphere` in its definition (the sim gives it drag; the renderer draws no sky, haze or sea waves on it, and no launch-site buildings, clouds, terrain shadows or stones: draft plan 071). It shares the home planet's biome map and flat grassland at latitude 0, longitude 0 (its own radius changes the hills, not the coasts; a `seed` or `site` on `hills` is draft 071), and a vessel placed there should use `surface` placement at that longitude or a hillside the field makes gentle. On a craters body the sun casts the craters' shadows and stones lie about the ground (ADR 0068); a stone has no collision (draft plan 060).

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

## Crew (API 0.1.38, plan 106, ADR 0176)
- **Seats.** Give a crewed part seats with `crewCapacity: 2`. The launch (`load-vessel`) seats roster members by design part index, and `crew-transfer` moves them between parts of one vessel.
- **Traits.** `ctx.crewTraits.register(defineCrewTrait({ id: 'acme.calm', label: 'Calm', abilities: { panicResistance: 1.3 } }))`. A trait can only scale quality factors (`controlSmoothing`, `scriptBudget`, `repairRate`, `dataQuality`, `gTolerance`, `panicResistance`); no trait or level ever turns a tool on or off.
- **Names.** Add syllables with `defineCrewNames({ id, first: [...], last: [...] })`; hired names are drawn from them with the world's own random stream, so the same world always hires the same people.
- XP is booked when a vessel is recovered, for each place its crew had not been before (fly by, orbit or land on a body). The world's rules decide death (`stock.crew-death`) and salaries.

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

## Antennas and ground stations (API 0.1.42, plan 114, ADR 0179)

- **An antenna.** `ctx.antennas.register(defineAntenna({ id: 'acme.relay-dish', label: 'Relay dish', kind: 'dish', range: 5e10, power: 80 }))`, then give a part `modules: [['stock.antenna', { antenna: 'acme.relay-dish' }]]`. Two nodes link under `√(range_a × range_b)` (times the world's `stock.comms-scale`), with a clear line of sight past bodies and terrain. The vessel uses its strongest switched-on antenna; the module's `setEnabled` action toggles it.
- **Your own antenna module** declares `antenna: (config, state) => ({ antenna, enabled })`.
- **A ground station.** `ctx.groundStations.register(defineGroundStation({ id: 'acme.north-station', label: 'North station', body: 'stock.home', latitude: 1.2, longitude: 0.4, range: 5e10 }))`. Every world site is already a station.
- **Probes.** A control source on a part without seats (`crewCapacity` 0) makes a probe. Without a link it follows the world's `stock.control-without-signal` rule. Read the state in a module with `ctx.vessel.signal()`.

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
	changeable: true // false = identity: fixed when the world is created
});
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

## Buildings (API 0.1.36, plan 090, ADR 0115)

`ctx.buildings.register(defineBuilding({ id, label, size: { w, d }, entrances, levels, provides, bodies?, hazardRadius?, visual }))` adds a building kind. Sizes are in **10 m cells** (`w` east, `d` north at rotation 0); `entrances` are cells on the footprint edge with the side they open to (`{ i: 1, j: 0, side: 'south' }`); `levels` carry `cost`, `buildDays`, `upkeep`, `power` and `capacity` per capability (`launch-pad`, `hangar`, `comms-node`, ...); `provides` lists the capabilities; `hazardRadius` keeps other buildings that many metres from the footprint centre. Stock's kinds are in `mods/stock/src/buildings.ts`.

Where a building may go is `canPlace(site, registries.buildings, kind, cell, rotation)` from the SDK: it returns `{ ok: true, roads }` (the road cells that connect every entrance) or the reasons (`overlap`, `outside-zone`, `hazard`, `no-road`, `body`, `unknown-kind`). The sim's `place-building` command uses the same function. A building is data, so another mod can patch it (`definePatch({ target: 'building', ... })`).

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
- Looks: a part's `visual.kind` selects one of the game's generators (`tank`, `capsule`, `engine`, ...) with your `palette` and `params`. A mod cannot add geometry code, but it can ship a model: see "Models in your package" below.
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
- **Limits** (checked at install, before the prompt, and named by file): `.glb` (glTF 2.0 binary) only; 2 MiB per file, 6 MiB and 32 files per package; at most 50 000 triangles, 32 mesh nodes (draw calls) and 8 textures per model; textures PNG or JPEG embedded in the file; no external or data URIs; no Draco, Meshopt, KTX2/Basis, WebP or AVIF (the game ships no decoders; export plain triangles). A part whose `visual.asset` names a file your package does not carry makes the mod fail to load with the part and file named.
- **Author in the part frame.** Origin at the part's centre, +Y up, metres, the same frame as `shape` and `attach`. The model should sit inside the shape, and its faces should be where the attach nodes are (`top` at the highest face, `bottom` at the lowest). The game does not rescale or move it; where it does not fit (sticks out by more than 5 cm or a tenth of the length, far smaller than the shape, a node off its face) it logs a warning once per part on the console.
- **Moving parts.** Name a node `moving` and give the visual an `articulation`: the node turns about its own origin (put the origin at the gimbal point); a gimballed engine's plume follows it. `deploy` animations are not supported for models.
- **Plume, glow, shadows, icon.** The engine plume (`plume`), temperature glow and shadows work as for generated parts, and the catalogue icon is rendered from your model. Materials are the glTF's own (PBR metallic-roughness, base colour texture); the part's `palette` is not applied to a model.
- **If it fails.** A model that cannot be parsed is reported on the console and the part is drawn by the generator named in `kind`, so keep `kind` meaningful (an engine says `engine`).
- **Test it the way the game does.** `packages/renderer/test/mod-sample-asset.test.ts` builds the sample, parses and resolves it, hands the bytes to `GltfPartProvider` and checks the bounds, the pivot and the plume; copy it for your model.

## Open items

- `defineSystem` (per-step logic over the world, phases `pre-physics`/`post-physics`, and once per game day `world-tick`, API 0.1.29, plan 082) is supported by the sim but has no stock example yet; this guide will gain a section when one exists. A world-tick system reads `ctx.tick.day` and draws only from `ctx.tick.rng`: it gets its own stream, which no other mod's system can disturb, and it reads no clock. A module that keeps working while its vessel is on rails can declare `background(ctx, dt)`: one closed form over the elapsed time (for example `state.charge += rate * dt`), run on each tick, at wake and before a save, in place of `updateOnRails`. See `packages/sim/test/world-tick.test.ts` for a battery and a world system. A stock producer of electric charge is draft plan 190.
- The HUD's throttle gauge still reads the stock engine's snapshot (a mod engine falls back to the page's own throttle display); mod-supplied VAB categories are plan 029.
- New renderer generators from a mod (executable render code), KTX2 textures, deploy animations in models and a hosted mod repository are not built (drafts 040 and 065).
