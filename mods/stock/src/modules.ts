/**
 * Stock modules. Each defines a config schema, serializable state and hooks. Effects on the
 * vessel (thrust, wheel torque, propellant draw, separation) go through `ctx.vessel`, the generic
 * capability API every mod gets (ADR 0015); the arithmetic lives in `engine.ts` and below, so it is
 * written once. See docs/guides/writing-a-mod.md.
 */
import {
	defineModule,
	z,
	type EntityId,
	type ModuleInfo,
	type Vec3,
	type VesselApi
} from '@orbital/sdk';
import { G0, SEA_LEVEL_PRESSURE, engineOutput, ispAt, propellantRates } from './engine.ts';
import { Ablator, ElectricCharge } from './resources.ts';
import {
	gimbalAuthority,
	gimbalDirection,
	gimbalTarget,
	slew,
	surfaceAuthority,
	surfaceTarget
} from './steering.ts';

declare module '@orbital/sdk' {
	interface EventMap {
		/** An engine ran out of propellant and shut down. */
		'stock:engine-flameout': { part: EntityId };
	}
}

/** Resource keys are definition ids, e.g. `stock.liquid-fuel`. */
const resourceKey = z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/, 'resource id');

// ---------------------------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------------------------

/**
 * Marks a part as a control source: a vessel is controllable while it contains a command part.
 * No config, no state.
 */
/**
 * Crew-days of rations a stock command seat carries (player-journey audit Q2, ADR 0323): from
 * launch the pod keeps its crew this long before carried supplies are drawn, as KSP's pods do.
 * Four home days are a full Earth day in the stock system.
 */
export const POD_RATION_DAYS = 4;

export const commandConfigSchema = z
	.object({
		/** The assist level this part gives, 0 to 3 (plan 260); the Hangar's build settings write it. */
		sasLevel: z.int().min(0).max(3).default(3),
		/** Crew-days of rations per seat (player-journey audit Q2, ADR 0323); 0 for none. */
		rationDays: z.number().nonnegative().optional()
	})
	.default({ sasLevel: 3 });

export const SAS_LEVEL_LABEL = ['Hold only', 'Basic', 'Advanced', 'Full'] as const;

export const ModuleCommand = defineModule({
	id: 'stock.command',
	config: commandConfigSchema,
	controlSource: true,
	// a save from before plan 260 stored the part without a config: full assist, as it was
	sasLevel: (config) => config?.sasLevel ?? 3,
	// a few days for each seat, from launch (ADR 0323)
	rations: (config) => config?.rationDays ?? POD_RATION_DAYS,
	describe: (config) => ({
		category: 'command',
		readouts: [
			{ id: 'sasLevel', label: 'SAS level', value: SAS_LEVEL_LABEL[config?.sasLevel ?? 3]! }
		],
		actions: [
			{
				id: 'setSasLevel',
				label: 'SAS level',
				kind: 'value' as const,
				value: config?.sasLevel ?? 3,
				min: 0,
				max: 3,
				step: 1,
				enabled: true,
				build: 'sasLevel',
				buildOnly: true
			}
		]
	})
});

export const probeComputerConfigSchema = z.object({
	/** Electric charge per second the probe core's computer draws (plan 208, ADR 0214). */
	drain: z.number().positive().default(0.025)
});

/** Draws the drain for `dt` seconds; what is missing is simply not there (the control check sees 0 EC). */
function computerDrain(
	ctx: {
		config: z.output<typeof probeComputerConfigSchema>;
		vessel: { resources: { withdraw(resource: string, amount: number): number } };
	},
	dt: number
): void {
	if (dt > 0) ctx.vessel.resources.withdraw(ElectricCharge.id, ctx.config.drain * dt);
}

/**
 * A probe core's computer (plan 208, ADR 0214): it draws electric charge, and while the vessel has
 * none the part's control source does not count (`needs`), so a probe-only vessel is uncontrolled.
 */
export const ModuleProbeComputer = defineModule({
	id: 'stock.probe-computer',
	config: probeComputerConfigSchema,
	needs: () => ElectricCharge.id,
	power: (config) => ({ rate: -config.drain }),
	describe: () => ({ category: 'command' }),
	update: computerDrain,
	background: computerDrain
});

// ---------------------------------------------------------------------------------------------
// Resource container
// ---------------------------------------------------------------------------------------------

export const containerConfigSchema = z.object({
	/** Per resource id: capacity in the resource's unit, and starting amount (default: full). */
	contents: z.record(
		resourceKey,
		z
			.object({
				capacity: z.number().positive(),
				amount: z.number().nonnegative().optional()
			})
			.transform((c) => ({ capacity: c.capacity, amount: c.amount ?? c.capacity }))
			.refine((c) => c.amount <= c.capacity, 'amount exceeds capacity')
	)
});
export type ContainerConfig = z.output<typeof containerConfigSchema>;
export interface ContainerState {
	/** Current amount per resource id, in the resource's unit. */
	amounts: Record<string, number>;
	/** Flow-locked resources (plan 213); absent in states saved before it, meaning none. */
	locked?: Record<string, true>;
}

/** "stock.liquid-fuel" → "liquid fuel", for a control's label. */
const resourceWords = (id: string): string => id.slice(id.indexOf('.') + 1).replace(/-/g, ' ');

function checkAmount(amount: number): void {
	if (!Number.isFinite(amount) || amount < 0) {
		throw new RangeError(`amount must be a finite number >= 0, got ${amount}`);
	}
}

/** Remove up to `amount` of `resource`; returns what was actually taken (0 if absent). */
export function withdraw(state: ContainerState, resource: string, amount: number): number {
	checkAmount(amount);
	const have = state.amounts[resource] ?? 0;
	const taken = Math.min(have, amount);
	if (resource in state.amounts) state.amounts[resource] = have - taken;
	return taken;
}

/** Add up to `amount` of `resource` (bounded by capacity); returns what was accepted (0 if the container does not hold it). */
export function deposit(
	config: ContainerConfig,
	state: ContainerState,
	resource: string,
	amount: number
): number {
	checkAmount(amount);
	const slot = config.contents[resource];
	if (!slot) return 0;
	const have = state.amounts[resource] ?? 0;
	const accepted = Math.min(slot.capacity - have, amount);
	state.amounts[resource] = have + accepted;
	return accepted;
}

const transferArgs = z.tuple([resourceKey, z.number()]);

function setLock(state: ContainerState, resource: string, locked: boolean): void {
	if (locked) state.locked = { ...state.locked, [resource]: true };
	else if (state.locked) {
		const { [resource]: _gone, ...rest } = state.locked;
		if (Object.keys(rest).length > 0) state.locked = rest;
		else delete state.locked;
	}
}

export const ModuleResourceContainer = defineModule({
	id: 'stock.resource-container',
	config: containerConfigSchema,
	describe: (config, state: ContainerState) => {
		const resources = Object.keys(config.contents).sort();
		if (resources.length === 0) return { category: 'tanks' };
		return {
			category: 'tanks',
			actions: [
				// one flow lock per resource (plan 213): `setLock:<resource>` calls `setLock`
				...resources.map((r) => ({
					id: `setLock:${r}`,
					label: `Lock ${resourceWords(r)}`,
					kind: 'toggle' as const,
					value: state.locked?.[r] === true,
					enabled: true,
					// a battery's lock is the Batteries group's (plan 241)
					...(r === ElectricCharge.id ? { group: 'stock.batteries' } : {})
				})),
				// how full it starts (plan 218): the Hangar writes `contents.<resource>.amount`
				...resources.map((r) => ({
					id: `fill:${r}`,
					label: `Fill ${resourceWords(r)}`,
					kind: 'value' as const,
					value: config.contents[r]!.amount,
					min: 0,
					max: config.contents[r]!.capacity,
					units: [{ unit: '%', factor: 100 / config.contents[r]!.capacity }],
					enabled: true,
					build: ['contents', r, 'amount'],
					buildOnly: true
				})),
				// the panel turns these into a picker of the other end (plan 214)
				{ id: 'transferOut', label: 'Transfer out', kind: 'trigger' as const, enabled: true },
				{ id: 'transferIn', label: 'Transfer in', kind: 'trigger' as const, enabled: true }
			]
		};
	},
	power: (config) => ({ capacity: config.contents[ElectricCharge.id]?.capacity ?? 0 }),
	state: (config): ContainerState => ({
		amounts: Object.fromEntries(
			Object.entries(config.contents).map(([resource, slot]) => [resource, slot.amount])
		)
	}),
	// The generic resource graph (ADR 0015) routes flow and sums mass through this.
	store: {
		resources: (config) => Object.keys(config.contents),
		amount: (_config, state, resource) => state.amounts[resource] ?? 0,
		withdraw: (_config, state, resource, amount) => withdraw(state, resource, amount),
		deposit: (config, state, resource, amount) => deposit(config, state, resource, amount),
		capacity: (config, _state, resource) => config.contents[resource]?.capacity ?? 0,
		locked: (_config, state, resource) => state.locked?.[resource] === true,
		setLocked: (_config, state, resource, locked) => setLock(state, resource, locked)
	},
	actions: {
		/** `(resource, amount)` -> amount actually removed. */
		withdraw: (ctx, ...args) => {
			const [resource, amount] = transferArgs.parse(args);
			return withdraw(ctx.state, resource, amount);
		},
		/** `(resource, amount)` -> amount actually added. */
		deposit: (ctx, ...args) => {
			const [resource, amount] = transferArgs.parse(args);
			return deposit(ctx.config, ctx.state, resource, amount);
		},
		/** `(resource, locked)`: the flow lock (plan 213); the descriptor ids are `setLock:<resource>`. */
		setLock: (ctx, ...args) => {
			const [resource, locked] = z.tuple([resourceKey, z.boolean()]).parse(args);
			if (resource in ctx.config.contents) setLock(ctx.state, resource, locked);
		},
		/** Picker triggers for the vessel panel (plan 214): the transfer itself is the `transfer` command. */
		transferOut: () => {},
		transferIn: () => {}
	},
	snapshot: (state) => ({
		amounts: { ...state.amounts },
		...(state.locked && Object.keys(state.locked).length > 0
			? { locked: Object.keys(state.locked).sort() }
			: {})
	})
});

// ---------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------

export const engineConfigSchema = z
	.object({
		/** Vacuum thrust at full throttle, N. */
		thrust: z.number().positive(),
		/** Specific impulse in vacuum, s. */
		ispVacuum: z.number().positive(),
		/** Specific impulse at the body's surface pressure, s. */
		ispSeaLevel: z.number().positive(),
		/** Consumed resources; `ratio` is relative volume (units), e.g. 0.9 fuel : 1.1 oxidizer. */
		propellants: z.array(z.object({ resource: resourceKey, ratio: z.number().positive() })).min(1),
		/** Thrust vector control (ADR 0045): none by default. */
		gimbal: z
			.object({
				/** Largest tilt of the thrust from the part axis, degrees. */
				range: z.number().nonnegative().max(30),
				/** Slew rate, degrees per second. */
				rate: z.number().positive().default(20)
			})
			.default({ range: 0, rate: 20 }),
		/** A solid motor (plan 210, ADR 0203): no throttle, no shutdown, the limiter fixed once lit. */
		solid: z.boolean().default(false),
		/** The thrust limiter it starts with, 0..1 (plan 218: set per part in the Hangar). */
		limiter: z.number().min(0).max(1).default(1),
		/** The share of the gimbal range it starts with, 0..1 (plan 218). */
		gimbalLimit: z.number().min(0).max(1).default(1)
	})
	.refine((c) => c.ispSeaLevel <= c.ispVacuum, 'ispSeaLevel must not exceed ispVacuum');
export type EngineConfig = z.output<typeof engineConfigSchema>;
export interface EngineState {
	/** Set by `onStage`/`activate`; cleared by `shutdown` and flameout. */
	ignited: boolean;
	/** Commanded throttle, 0..1; the sim writes the vessel throttle here. */
	throttle: number;
	/** The sim sets this (via the `flameout` action) when propellant ran short. */
	flameout: boolean;
	/** Thrust tilt towards +X and towards +Z, rad (ADR 0045). */
	gimbal: [number, number];
	/** Thrust limiter, 0..1 (plan 210): scales the mass flow. */
	limiter: number;
	/** The gimbal holds the axis (plan 210). */
	gimbalLock: boolean;
	/** Fraction of the gimbal range used, 0..1 (plan 210). */
	gimbalLimit: number;
	/** What the engine does now (plan 240): thrust N, Isp s and mass flow kg/s, set each step. */
	live?: { thrust: number; isp: number; flow: number };
	/** The propellant that ran short when it flamed out (plan 240). */
	flameoutCause?: string;
}

const resourceName = (id: string): string => id.replace(/^[^.]*\./, '').replace(/-/g, ' ');

/** "Flameout: out of liquid fuel" (plan 240); a flameout from the action alone has no cause. */
const flameoutText = (state: EngineState): string =>
	`Flameout: out of ${state.flameoutCause ? resourceName(state.flameoutCause) : 'propellant'}`;

/**
 * Move the thrust vector towards the angles the mixer asks for (ADR 0045); a cold or idle engine,
 * or one without gimbal, relaxes to the axis at the same rate. Reads the centre of mass only when
 * there is a range to steer with.
 */
/** The usable gimbal range, rad: none when locked, the limit's share otherwise (plan 210). */
const gimbalRange = (config: EngineConfig, state: EngineState): number =>
	state.gimbalLock === true ? 0 : (config.gimbal.range * Math.PI * (state.gimbalLimit ?? 1)) / 180;

function steerGimbal(
	ctx: { config: EngineConfig; state: EngineState; vessel: VesselApi },
	dt: number
): void {
	const { config, state, vessel } = ctx;
	const step = (config.gimbal.rate * Math.PI * dt) / 180;
	const range = gimbalRange(config, state);
	const live = range > 0 && state.ignited && state.throttle > 0;
	const [tx, tz] = live
		? gimbalTarget(vessel.centreOfMass, vessel.torqueDemand, range)
		: ([0, 0] as const);
	state.gimbal = [slew(state.gimbal[0], tx, step), slew(state.gimbal[1], tz, step)];
}

/** The limiter of a state saved before plan 210 (absent) is 1. */
const limiterOf = (state: EngineState): number => state.limiter ?? 1;

export const ModuleEngine = defineModule({
	id: 'stock.engine',
	config: engineConfigSchema,
	state: (config): EngineState => ({
		ignited: false,
		throttle: 0,
		flameout: false,
		gimbal: [0, 0],
		limiter: config.limiter,
		gimbalLock: false,
		gimbalLimit: config.gimbalLimit
	}),
	// What tools (stage delta-v) may know without running the sim (ADR 0033): the flow is fixed by
	// the vacuum rating and thrust follows Isp(p) (`engineOutput`), so two curve points are exact.
	describe: (config, state) => ({
		engine: {
			massFlow: (config.thrust * limiterOf(state)) / (config.ispVacuum * G0),
			thrust: [
				{ pressure: 0, thrust: config.thrust * limiterOf(state) },
				{
					pressure: SEA_LEVEL_PRESSURE,
					thrust:
						(config.thrust * limiterOf(state) * ispAt(config, SEA_LEVEL_PRESSURE)) /
						config.ispVacuum
				}
			],
			propellants: config.propellants.map((p) => ({ resource: p.resource, ratio: p.ratio })),
			ignited: state.ignited,
			flameout: state.flameout,
			throttle: Math.min(1, Math.max(0, state.throttle))
		},
		category: 'propulsion',
		// the inspector's status line (plan 214): what it does now, as text
		readouts: [
			{
				id: 'status',
				label: 'Status',
				value: state.flameout
					? flameoutText(state)
					: state.ignited
						? state.throttle > 0
							? `Running at ${Math.round(state.throttle * 100)} %`
							: 'Idle'
						: 'Off'
			},
			...(state.live && state.ignited && state.live.thrust > 0
				? [
						{
							id: 'now',
							label: 'Now',
							value: `${(state.live.thrust / 1000).toFixed(1)} kN · Isp ${Math.round(
								state.live.isp
							)} s · ${state.live.flow.toFixed(2)} kg/s`
						}
					]
				: []),
			{
				id: 'thrust',
				label: 'Thrust',
				value: `${Math.round((config.thrust * limiterOf(state)) / 1000)} kN max · Isp ${Math.round(
					ispAt(config, SEA_LEVEL_PRESSURE)
				)}–${Math.round(config.ispVacuum)} s`
			}
		],
		actions: [
			{
				id: 'setActive',
				label: config.solid ? 'Ignite' : 'Engine',
				kind: 'toggle',
				value: state.ignited,
				// a lit solid motor cannot be shut down
				enabled: !(config.solid && state.ignited),
				group: 'stock.engines',
				icon: 'engine'
			},
			{
				id: 'setLimiter',
				label: 'Thrust limiter',
				kind: 'value',
				value: limiterOf(state),
				min: 0,
				max: 1,
				step: 0.005,
				// typed in the inspector as a share or as thrust (plan 214)
				units: [
					{ unit: '%', factor: 100 },
					{ unit: 'kN', factor: config.thrust / 1000 }
				],
				// a solid motor's limiter is set before ignition (plan 210)
				enabled: !(config.solid && state.ignited),
				build: 'limiter'
			},
			...(config.gimbal.range > 0
				? [
						{
							// 0 holds the axis; the lock itself is an action for groups and scripts (the
							// snapshot budget of ADR 0174 has room for one more control per engine)
							id: 'setGimbalLimit',
							label: 'Gimbal limit',
							kind: 'value' as const,
							value: state.gimbalLock === true ? 0 : (state.gimbalLimit ?? 1),
							min: 0,
							max: 1,
							step: 0.05,
							units: [{ unit: '%', factor: 100 }],
							more: true,
							enabled: true,
							build: 'gimbalLimit'
						}
					]
				: [])
		]
	}),
	onStage(ctx) {
		ctx.state.ignited = true;
		ctx.state.flameout = false;
		delete ctx.state.flameoutCause;
	},
	/** Thrust times the lever of the bell about the centre of mass (ADR 0049); nothing when cold or fixed. */
	controlAuthority({ config, state, vessel }) {
		const range = gimbalRange(config, state);
		if (range <= 0) return { x: 0, y: 0, z: 0 };
		const { thrust } = engineOutput(config, state, vessel.ambient.pressure);
		if (thrust <= 0) return { x: 0, y: 0, z: 0 };
		return gimbalAuthority(vessel.centreOfMass, thrust, range);
	},
	/**
	 * Each step: take the vessel throttle, work out thrust and mass flow at the ambient pressure,
	 * draw the propellants from what is reachable, and push along the part's local +Y. If the
	 * propellants cannot cover the step the engine produces thrust for the fraction it got and
	 * flames out.
	 */
	update(ctx, dt) {
		const { state, config, vessel } = ctx;
		state.throttle = Math.min(1, Math.max(0, vessel.control.throttle));
		steerGimbal(ctx, dt);
		if (!state.ignited) {
			delete state.live;
			return;
		}
		const out = engineOutput(config, state, vessel.ambient.pressure);
		if (out.massFlow <= 0) {
			state.live = { thrust: 0, isp: ispAt(config, vessel.ambient.pressure), flow: 0 };
			return;
		}
		const rates = propellantRates(
			config,
			out.massFlow,
			(resource) => ctx.registries.resources.get(resource)?.density ?? 0
		);
		let satisfied = 1;
		let short: string | undefined;
		for (const { resource, rate } of rates) {
			const share = vessel.resources.amount(resource) / (rate * dt);
			if (share < satisfied) {
				satisfied = share;
				short = resource;
			}
		}
		state.live = {
			thrust: out.thrust * Math.min(1, satisfied),
			isp: ispAt(config, vessel.ambient.pressure),
			flow: out.massFlow * Math.min(1, satisfied)
		};
		for (const { resource, rate } of rates) {
			vessel.resources.withdraw(resource, rate * dt * satisfied);
		}
		if (satisfied > 0) {
			const dir = gimbalDirection(state.gimbal[0], state.gimbal[1]);
			const f = out.thrust * satisfied;
			vessel.applyForce({ x: f * dir.x, y: f * dir.y, z: f * dir.z });
		}
		if (satisfied < 1) {
			state.ignited = false;
			state.flameout = true;
			if (short !== undefined) state.flameoutCause = short;
			ctx.events.emit('stock:engine-flameout', { part: ctx.entity });
		}
	},
	actions: {
		activate: (ctx) => {
			ctx.state.ignited = true;
			ctx.state.flameout = false;
			delete ctx.state.flameoutCause;
		},
		shutdown: (ctx) => {
			if (ctx.config.solid) return; // a lit solid motor burns out (plan 210)
			ctx.state.ignited = false;
		},
		/** `(on)`: activate or shut down (the part action toggle, plan 110); a solid motor only lights. */
		setActive: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			if (!on && ctx.config.solid) return;
			ctx.state.ignited = on;
			if (on) {
				ctx.state.flameout = false;
				delete ctx.state.flameoutCause;
			}
		},
		/** `(limiter)` 0..1; a lit solid motor keeps its limiter (plan 210). */
		setLimiter: (ctx, ...args) => {
			const [v] = z.tuple([z.number().min(0).max(1)]).parse(args);
			if (ctx.config.solid && ctx.state.ignited) return;
			ctx.state.limiter = v;
		},
		setGimbalLock: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.gimbalLock = on;
		},
		/** `(fraction)` 0..1 of the gimbal range. */
		setGimbalLimit: (ctx, ...args) => {
			const [v] = z.tuple([z.number().min(0).max(1)]).parse(args);
			ctx.state.gimbalLimit = v;
			ctx.state.gimbalLock = false;
		},
		/** `(value)` clamped to 0..1. */
		setThrottle: (ctx, ...args) => {
			const [value] = z.tuple([z.number()]).parse(args);
			ctx.state.throttle = Math.min(1, Math.max(0, value));
		},
		flameout: (ctx) => {
			ctx.state.ignited = false;
			ctx.state.flameout = true;
		}
	},
	snapshot: (state) => ({
		ignited: state.ignited,
		throttle: state.throttle,
		flameout: state.flameout,
		gimbal: [state.gimbal[0], state.gimbal[1]],
		limiter: limiterOf(state),
		gimbalLock: state.gimbalLock === true,
		gimbalLimit: state.gimbalLimit ?? 1,
		// the live read-outs reach the page through the snapshot (plan 240)
		...(state.live ? { live: { ...state.live } } : {}),
		...(state.flameoutCause ? { flameoutCause: state.flameoutCause } : {})
	})
});

// ---------------------------------------------------------------------------------------------
// Decoupler
// ---------------------------------------------------------------------------------------------

export const decouplerConfigSchema = z.object({
	/** Which attach node is severed: the part attached there leaves with its subtree. */
	separates: z.enum(['top', 'bottom', 'radial']).default('top'),
	/** Total impulse pushing the two halves apart, N·s (split by the sim, equal and opposite). */
	ejectionImpulse: z.number().nonnegative().default(2_000),
	/**
	 * Whether staging fires it at first (plan 241's switch, as a design's part setting): an escape
	 * tower on a boost cover leaves with the cover, so its own joint stays shut (system audit D6).
	 */
	staged: z.boolean().default(true),
	/**
	 * A separator (plan 275): it is used up by the cut and leaves no ring on either side. It
	 * counts as spent mass the moment it fires.
	 */
	consume: z.boolean().optional()
});
export type DecouplerConfig = z.output<typeof decouplerConfigSchema>;
export interface DecouplerState {
	/** True once fired. The sim performs the split when it sees the flag flip. */
	decoupled: boolean;
	/** Staging fires it (plan 241); off, only its own action does. Absent: on. */
	staged?: boolean;
}

/** Fire once: mark the state and ask the vessel to sever the configured node with the ejection impulse. */
function fire(ctx: {
	config: DecouplerConfig;
	state: DecouplerState;
	vessel: { detach(node: string, impulse?: number, options?: { consume?: boolean }): void };
}): void {
	if (ctx.state.decoupled) return;
	// detach first: it refuses (throws) for a part inside a closed bay, which must stay armed
	ctx.vessel.detach(
		ctx.config.separates,
		ctx.config.ejectionImpulse,
		ctx.config.consume ? { consume: true } : undefined
	);
	ctx.state.decoupled = true;
}

export const ModuleDecoupler = defineModule({
	id: 'stock.decoupler',
	config: decouplerConfigSchema,
	state: (config): DecouplerState => ({
		decoupled: false,
		...(config.staged ? {} : { staged: false })
	}),
	describe: (config, state) => ({
		separator: { node: config.separates, done: state.decoupled },
		category: 'structural',
		actions: [
			{
				id: 'decouple',
				label: 'Decouple',
				kind: 'trigger',
				enabled: !state.decoupled,
				...(state.decoupled ? { reason: 'Already decoupled' } : {}),
				icon: 'decouple'
			},
			{
				id: 'setStaged',
				label: 'Fires with staging',
				kind: 'toggle' as const,
				value: state.staged !== false,
				enabled: !state.decoupled,
				...(state.decoupled ? { reason: 'Already decoupled' } : {})
			}
		]
	}),
	onStage(ctx) {
		if (ctx.state.staged === false) return;
		fire(ctx);
	},
	actions: {
		decouple: (ctx) => {
			fire(ctx);
		},
		/** `(staged)`: whether the stage that holds it fires it (plan 241). */
		setStaged: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.staged = on;
		}
	},
	snapshot: (state) => ({
		decoupled: state.decoupled,
		...(state.staged === false ? { staged: false } : {})
	})
});

// ---------------------------------------------------------------------------------------------
// Reaction wheel
// ---------------------------------------------------------------------------------------------

export const reactionWheelConfigSchema = z.object({
	/** Maximum torque about each body axis, N·m. */
	torque: z.number().positive(),
	/** Electric charge drawn per second at full torque demand, EC/s; scales linearly with demand. */
	chargeRate: z.number().nonnegative().default(0)
});
export type ReactionWheelConfig = z.output<typeof reactionWheelConfigSchema>;
/** Who a wheel works for (plan 241): both, the assist alone, or the pilot alone. */
export type WheelMode = 'normal' | 'sas' | 'pilot';
export interface ReactionWheelState {
	enabled: boolean;
	mode?: WheelMode;
}

/** Whether a wheel in `mode` answers a demand that is `assisted` or the player's. */
export const wheelServes = (mode: WheelMode | undefined, assisted: boolean): boolean =>
	mode === undefined || mode === 'normal' || (mode === 'sas') === assisted;

export const ModuleReactionWheel = defineModule({
	id: 'stock.reaction-wheel',
	config: reactionWheelConfigSchema,
	state: (): ReactionWheelState => ({ enabled: true }),
	describe: (_config, state) => ({
		category: 'control',
		actions: [
			{
				id: 'setEnabled',
				label: 'Reaction wheel',
				kind: 'toggle',
				value: state.enabled,
				enabled: true,
				icon: 'wheel'
			},
			{
				id: 'setMode',
				label: 'Wheel mode',
				kind: 'mode' as const,
				value: state.mode ?? 'normal',
				options: [
					{ value: 'normal', label: 'Normal' },
					{ value: 'sas', label: 'SAS only' },
					{ value: 'pilot', label: 'Pilot only' }
				],
				enabled: true
			}
		]
	}),
	/** `torque` about every axis while enabled and powered (ADR 0049). */
	controlAuthority({ state, config, vessel }) {
		const powered = config.chargeRate <= 0 || vessel.resources.amount(ElectricCharge.id) > 0;
		// the assist counts only on wheels that serve it (plan 241)
		const t = state.enabled && powered && wheelServes(state.mode, true) ? config.torque : 0;
		return { x: t, y: t, z: t };
	},
	/**
	 * Torque follows the vessel attitude demand (pitch about +X, roll about +Y, yaw about +Z) up to
	 * `torque` per axis; electric charge is drawn in proportion to the demand magnitude, and the
	 * torque is scaled by the fraction of the charge that was available.
	 */
	update(ctx, dt) {
		const { state, config, vessel } = ctx;
		if (!state.enabled) return;
		const { pitch, roll, yaw } = vessel.control;
		if (!wheelServes(state.mode, vessel.control.assisted === true)) return;
		const demand = Math.min(1, Math.hypot(pitch, roll, yaw));
		if (demand === 0) return;
		let supplied = 1;
		const need = config.chargeRate * demand * dt;
		if (need > 0) {
			supplied = vessel.resources.withdraw(ElectricCharge.id, need) / need;
		}
		if (supplied <= 0) return;
		const k = config.torque * supplied;
		vessel.applyTorque({ x: pitch * k, y: roll * k, z: yaw * k });
	},
	actions: {
		/** `(enabled)`. */
		setEnabled: (ctx, ...args) => {
			const [enabled] = z.tuple([z.boolean()]).parse(args);
			ctx.state.enabled = enabled;
		},
		/** `(mode)`: normal, sas or pilot (plan 241). */
		setMode: (ctx, ...args) => {
			const [mode] = z.tuple([z.enum(['normal', 'sas', 'pilot'])]).parse(args);
			ctx.state.mode = mode;
		}
	},
	snapshot: (state) => ({
		enabled: state.enabled,
		...(state.mode && state.mode !== 'normal' ? { mode: state.mode } : {})
	})
});

// ---------------------------------------------------------------------------------------------
// Landing leg
// ---------------------------------------------------------------------------------------------

export const landingLegConfigSchema = z.object({
	/** Distance of each of the four feet from the part axis, m. */
	spread: z.number().positive().default(2),
	/** How far below the part origin the feet's centres sit, m. */
	drop: z.number().positive().default(0.4),
	/** Edge length of a foot, m. */
	footSize: z.number().positive().default(0.3),
	/** Whether the legs start deployed. */
	deployed: z.boolean().default(false),
	/**
	 * `ring`: four feet around the stack (the stock ring of legs). `single`: one leg on the side of
	 * a hull (plan 302): its radial node is on -X and its foot sits `spread` out along +X.
	 */
	layout: z.enum(['ring', 'single']).default('ring')
});
export type LandingLegConfig = z.output<typeof landingLegConfigSchema>;
export interface LandingLegState {
	deployed: boolean;
}

/**
 * Four foot boxes on the +X, -X, +Z and -Z sides, in the part frame, when deployed; nothing when
 * retracted. The sim turns them into extra colliders of the vessel's body (ADR 0019).
 */
export function landingLegColliders(
	config: Pick<LandingLegConfig, 'spread' | 'drop' | 'footSize'> & {
		layout?: LandingLegConfig['layout'];
	},
	state: LandingLegState
): {
	offset: { x: number; y: number; z: number };
	halfExtents: { x: number; y: number; z: number };
}[] {
	if (!state.deployed) return [];
	const h = config.footSize / 2;
	const halfExtents = { x: h, y: h, z: h };
	if (config.layout === 'single')
		return [{ offset: { x: config.spread, y: -config.drop, z: 0 }, halfExtents }];
	return [
		[config.spread, 0],
		[-config.spread, 0],
		[0, config.spread],
		[0, -config.spread]
	].map(([x, z]) => ({ offset: { x: x!, y: -config.drop, z: z! }, halfExtents }));
}

export const ModuleLandingLeg = defineModule({
	id: 'stock.landing-leg',
	config: landingLegConfigSchema,
	state: (config): LandingLegState => ({ deployed: config.deployed }),
	describe: (_config, state) => ({
		category: 'landing',
		actions: [
			{
				id: 'setDeployed',
				label: 'Landing legs',
				kind: 'toggle',
				value: state.deployed,
				enabled: true,
				group: 'stock.landing-gear',
				// the Hangar sets whether they start out (plan 316)
				build: 'deployed',
				icon: 'legs'
			}
		]
	}),
	// Staging deploys the legs, like a decoupler fires.
	onStage(ctx) {
		ctx.state.deployed = true;
	},
	colliders: (config, state) => landingLegColliders(config, state),
	actions: {
		deploy: (ctx) => {
			ctx.state.deployed = true;
		},
		retract: (ctx) => {
			ctx.state.deployed = false;
		},
		toggle: (ctx) => {
			ctx.state.deployed = !ctx.state.deployed;
		},
		/** `(deployed)` (the part action toggle, plan 110). */
		setDeployed: (ctx, ...args) => {
			const [deployed] = z.tuple([z.boolean()]).parse(args);
			ctx.state.deployed = deployed;
		}
	},
	snapshot: (state) => ({ deployed: state.deployed })
});

// ---------------------------------------------------------------------------------------------
// Heat shield
// ---------------------------------------------------------------------------------------------

export const heatShieldConfigSchema = z.object({
	/** Ablator carried, in u (kg). */
	ablator: z.number().positive().default(120),
	/** Heat carried away per kg of ablator burnt, J/kg. */
	heatOfAblation: z.number().positive().default(3e6),
	/** Skin temperature at which ablation starts, K. */
	ablationTemperature: z.number().positive().default(700)
});
export type HeatShieldConfig = z.output<typeof heatShieldConfigSchema>;
export interface HeatShieldState {
	/** Ablator left, u. */
	ablator: number;
}

/**
 * An ablative shield: once its skin is above `ablationTemperature` it carries the whole airflow
 * heat away by burning ablator (`heat.power · dt / heatOfAblation` kg per step) and its skin stays
 * near that temperature; with no ablator left it heats like any part. It is also the store of the
 * ablator, so the ablator weighs on the vessel until it is burnt (ADR 0023).
 */
export const ModuleHeatShield = defineModule({
	id: 'stock.heat-shield',
	config: heatShieldConfigSchema,
	state: (config): HeatShieldState => ({ ablator: config.ablator }),
	describe: (config, state) => ({
		category: 'thermal',
		readouts: [
			{
				id: 'ablator',
				label: 'Ablator',
				value: `${Math.round(state.ablator)} of ${config.ablator} u`
			}
		]
	}),
	store: {
		resources: () => [Ablator.id],
		amount: (_config, state, resource) => (resource === Ablator.id ? state.ablator : 0),
		withdraw: (_config, state, resource, amount) => {
			checkAmount(amount);
			if (resource !== Ablator.id) return 0;
			const taken = Math.min(state.ablator, amount);
			state.ablator -= taken;
			return taken;
		},
		deposit: (config, state, resource, amount) => {
			checkAmount(amount);
			if (resource !== Ablator.id) return 0;
			const accepted = Math.min(config.ablator - state.ablator, amount);
			state.ablator += accepted;
			return accepted;
		}
	},
	absorbHeat(ctx, heat, dt) {
		const { state, config } = ctx;
		if (state.ablator <= 0 || heat.temperature < config.ablationTemperature) return 0;
		const kgPerUnit = ctx.registries.resources.get(Ablator.id)?.density ?? 1;
		const capacity = (state.ablator * kgPerUnit * config.heatOfAblation) / dt;
		const absorbed = Math.min(heat.power, capacity);
		state.ablator -= (absorbed * dt) / (config.heatOfAblation * kgPerUnit);
		return absorbed;
	},
	snapshot: (state) => ({ ablator: state.ablator })
});

// ---------------------------------------------------------------------------------------------
// Fin
// ---------------------------------------------------------------------------------------------

export const finConfigSchema = z.object({
	/** Planform area of the plate, m². */
	area: z.number().positive(),
	/** Lift-curve slope per radian at small angles of attack (thin plate: 2π; a low aspect ratio fin has less). */
	liftSlope: z.number().positive().default(2),
	/** Normal-force coefficient of the plate broadside to the flow (stall). */
	crossflow: z.number().positive().default(1.2),
	/** Centre of pressure in the part frame, m. */
	centre: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
	/** Extra damping of the rotational airflow, in multiples of the quasi-steady one (ADR 0046). */
	damping: z.number().nonnegative().max(100).default(60)
});
export type FinConfig = z.output<typeof finConfigSchema>;

/** The descriptor of a lifting plate: what the editor's stability read-out and catalogue read. */
const finInfo = (config: FinConfig): ModuleInfo => ({
	lift: {
		area: config.area,
		liftSlope: config.liftSlope,
		crossflow: config.crossflow,
		centre: [config.centre[0], config.centre[1], config.centre[2]]
	},
	category: 'aero'
});

/**
 * Force along the plate normal (local Z) for the air velocity `v` of the plate, part frame, in
 * density `rho` (ADR 0035): `-1/2 rho V² S (liftSlope sin a cos a + crossflow sin a |sin a|)`, `a`
 * being the angle between the flow and the plate plane.
 */
export function finNormalForce(config: FinConfig, v: Vec3, rho: number): number {
	const speed = Math.hypot(v.x, v.y, v.z);
	if (speed === 0 || rho === 0) return 0;
	const sinA = v.z / speed;
	const cosA = Math.hypot(v.x, v.y) / speed;
	const cn = config.liftSlope * sinA * cosA + config.crossflow * sinA * Math.abs(sinA);
	return -0.5 * rho * speed * speed * config.area * cn;
}

/**
 * Extra force along the plate normal against the rotation (ADR 0046): `w` is the normal component
 * of the airflow at the centre of pressure that comes from the vessel's rotation, `speed` the
 * airspeed there. `-1/2 rho V S liftSlope damping w`: the quasi-steady damping counted `damping`
 * more times, standing for downwash lag and body-fin interference (not modelled).
 */
export function finDampingForce(
	config: Pick<FinConfig, 'area' | 'liftSlope' | 'damping'>,
	speed: number,
	rho: number,
	w: number
): number {
	return -0.5 * rho * speed * config.area * config.liftSlope * config.damping * w;
}

/** Rotational part of the airflow along local Z at `at`: the point's air velocity minus the centre of mass's. */
function rotationalNormalFlow(vessel: VesselApi, at: Vec3): number {
	return vessel.airVelocity(at).z - vessel.airVelocity(vessel.centreOfMass).z;
}

/**
 * A fixed fin: a flat plate in the part's X-Y plane (span along X, chord along Y) whose normal
 * force pushes the rocket back towards its velocity vector when the fins sit behind the centre of
 * mass. It reads the airflow at its centre of pressure (`vessel.airVelocity`, which includes the
 * vessel's rotation, so fins damp rotation too).
 */
export const ModuleFin = defineModule({
	id: 'stock.fin',
	config: finConfigSchema,
	state: (): Record<string, never> => ({}),
	describe: (config) => finInfo(config),
	update(ctx) {
		const { config, vessel } = ctx;
		const rho = vessel.ambient.density;
		if (rho === 0) return;
		const at = { x: config.centre[0], y: config.centre[1], z: config.centre[2] };
		const v = vessel.airVelocity(at);
		let force = finNormalForce(config, v, rho);
		if (config.damping > 0) {
			const speed = Math.hypot(v.x, v.y, v.z);
			force += finDampingForce(config, speed, rho, rotationalNormalFlow(vessel, at));
		}
		if (force !== 0) vessel.applyForce({ x: 0, y: 0, z: force }, at);
	}
});

// ---------------------------------------------------------------------------------------------
// Control surface
// ---------------------------------------------------------------------------------------------

export const controlSurfaceConfigSchema = finConfigSchema.safeExtend({
	/** Largest deflection of the plate about its span (local X), degrees. */
	maxDeflection: z.number().positive().max(60).default(25),
	/** Slew rate, degrees per second. */
	deflectionRate: z.number().positive().default(60)
});
export type ControlSurfaceConfig = z.output<typeof controlSurfaceConfigSchema>;
export interface ControlSurfaceState {
	/** Deflection about local X, rad. */
	deflection: number;
	/** Share of the full deflection it may use, 0..1 (plan 214; absent: 1). */
	authority?: number;
	/** Axes it answers, absent: all (plan 214). */
	pitch?: boolean;
	yaw?: boolean;
	roll?: boolean;
	/** A steady deflection added to the control demand, 0..1 of the full range (plan 241). */
	deploy?: number;
}

/** The torque demand a control surface answers: its axes and its authority (plan 214). */
const surfaceDemand = (s: ControlSurfaceState, d: Vec3): Vec3 => {
	const a = s.authority ?? 1;
	return {
		x: s.pitch === false ? 0 : d.x * a,
		y: s.roll === false ? 0 : d.y * a,
		z: s.yaw === false ? 0 : d.z * a
	};
};

/**
 * Force of the deflected plate in the part frame (ADR 0045): the plate normal is
 * `(0, -sin d, cos d)`; the airflow is rotated into the plate's frame and the fin law applies.
 */
export function controlSurfaceForce(
	config: ControlSurfaceConfig,
	v: Vec3,
	rho: number,
	d: number
): Vec3 {
	const sin = Math.sin(d);
	const cos = Math.cos(d);
	const f = finNormalForce(
		config,
		{ x: v.x, y: v.y * cos + v.z * sin, z: -v.y * sin + v.z * cos },
		rho
	);
	return { x: 0, y: -f * sin, z: f * cos };
}

/**
 * A fin whose whole plate turns about its span by a commanded deflection. The mixer
 * (`steering.ts`) picks the deflection from the vessel's attitude demand and the lever arm of the
 * centre of pressure about the centre of mass; the plate slews at `deflectionRate`.
 */
export const ModuleControlSurface = defineModule({
	id: 'stock.control-surface',
	config: controlSurfaceConfigSchema,
	state: (): ControlSurfaceState => ({ deflection: 0 }),
	// At rest a control surface is a fin (the stability read-out of the editor); its controls set
	// how much it may deflect and which axes it answers (plan 214, rancangan §7.6b)
	describe: (config, state) => ({
		...finInfo(config),
		actions: [
			{
				id: 'setAuthority',
				label: 'Authority',
				kind: 'value',
				value: state.authority ?? 1,
				min: 0,
				max: 1,
				step: 0.05,
				units: [{ unit: '%', factor: 100 }],
				enabled: true
			},
			{
				id: 'setDeploy',
				label: 'Deploy',
				kind: 'value' as const,
				value: state.deploy ?? 0,
				min: 0,
				max: 1,
				step: 0.05,
				units: [{ unit: '%', factor: 100 }],
				enabled: true
			},
			...(['pitch', 'yaw', 'roll'] as const).map((axis) => ({
				id: `setAxis:${axis}`,
				label: axis[0]!.toUpperCase() + axis.slice(1),
				kind: 'toggle' as const,
				value: state[axis] !== false,
				more: true,
				enabled: true
			}))
		]
	}),
	actions: {
		/** `(deploy)`, 0..1: a steady deflection added to the control demand, as a flap or an air brake (plan 241). */
		setDeploy: (ctx, ...args) => {
			const [d] = z.tuple([z.number().min(0).max(1)]).parse(args);
			ctx.state.deploy = d;
		},
		/** `(authority)`, 0..1. */
		setAuthority: (ctx, ...args) => {
			const [a] = z.tuple([z.number().min(0).max(1)]).parse(args);
			ctx.state.authority = a;
		},
		/** `setAxis:<pitch|yaw|roll>(on)` (keyed action id, ADR 0220 point 4). */
		setAxis: (ctx, ...args) => {
			const [axis, on] = z.tuple([z.enum(['pitch', 'yaw', 'roll']), z.boolean()]).parse(args);
			ctx.state[axis] = on;
		}
	},
	snapshot: (state) => ({
		deflection: state.deflection,
		authority: state.authority ?? 1,
		pitch: state.pitch !== false,
		yaw: state.yaw !== false,
		roll: state.roll !== false,
		...(state.deploy ? { deploy: state.deploy } : {})
	}),
	/** The force change over the full range in the present airflow, times the lever (ADR 0049). */
	controlAuthority({ config, state, vessel }) {
		const rho = vessel.ambient.density;
		if (rho === 0) return { x: 0, y: 0, z: 0 };
		const at = { x: config.centre[0], y: config.centre[1], z: config.centre[2] };
		const v = vessel.airVelocity(at);
		const max = (config.maxDeflection * Math.PI) / 180;
		const neutral = controlSurfaceForce(config, v, rho, 0);
		const full = controlSurfaceForce(config, v, rho, max);
		const full3 = surfaceAuthority(at, vessel.centreOfMass, {
			x: full.x - neutral.x,
			y: full.y - neutral.y,
			z: full.z - neutral.z
		});
		// what it may use of it: its authority and its axes (plan 214)
		return surfaceDemand(state, full3);
	},
	update(ctx, dt) {
		const { config, state, vessel } = ctx;
		const at = { x: config.centre[0], y: config.centre[1], z: config.centre[2] };
		const v = vessel.airVelocity(at);
		const rho = vessel.ambient.density;
		const max = (config.maxDeflection * Math.PI) / 180;
		const demand = surfaceDemand(state, vessel.torqueDemand);
		const target = Math.max(
			-max,
			Math.min(
				max,
				surfaceTarget(at, vessel.centreOfMass, demand, max, v.y <= 0) + (state.deploy ?? 0) * max
			)
		);
		state.deflection = slew(state.deflection, target, (config.deflectionRate * Math.PI * dt) / 180);
		if (rho === 0) return;
		const force = controlSurfaceForce(config, v, rho, state.deflection);
		if (config.damping > 0) {
			const speed = Math.hypot(v.x, v.y, v.z);
			force.z += finDampingForce(config, speed, rho, rotationalNormalFlow(vessel, at));
		}
		vessel.applyForce(force, at);
	}
});

// ---------------------------------------------------------------------------------------------
// Wing
// ---------------------------------------------------------------------------------------------

export const wingConfigSchema = z.object({
	/** Planform area of the part, m². */
	area: z.number().positive(),
	/**
	 * Aspect ratio of the wing this part is half of when mounted as a pair, `b² / S` over both
	 * halves; with the area it sets the lift slope and the induced drag (ADR 0075).
	 */
	aspectRatio: z.number().positive().max(40),
	/** Span efficiency `e` of the lift distribution (1 for an ellipse). */
	efficiency: z.number().positive().max(1).default(0.85),
	/** Angle of attack where the lift stops growing, degrees. */
	stallAngle: z.number().positive().max(40).default(15),
	/** Zero-lift drag coefficient (skin friction and form of the section). */
	parasiteDrag: z.number().nonnegative().default(0.02),
	/** Normal-force coefficient broadside to the flow (stalled plate), as the fin's. */
	crossflow: z.number().positive().default(1.2),
	/** Aerodynamic centre in the part frame, m (a quarter chord behind the leading edge). */
	centre: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
	/**
	 * Extra damping of the rotational airflow in multiples of the quasi-steady one (ADR 0046). Zero
	 * by default: the wings of a craft sit metres from its roll axis, where the explicit step is
	 * unstable above `(1 + damping) dt c / I < 1` (ADR 0075); the quasi-steady damping is always on.
	 */
	damping: z.number().nonnegative().max(100).default(0),
	/**
	 * Flaps (plan 063, ADR 0161 point 4): at full flap, lift coefficient added, drag coefficient
	 * added and stall angle lost (degrees). Zero lift: the part has no flaps.
	 */
	flapLift: z.number().nonnegative().default(0),
	flapDrag: z.number().nonnegative().default(0),
	flapStall: z.number().nonnegative().max(20).default(0),
	/**
	 * A wing with heat tiles under it (plan 356, the orbiter's): a Hangar setting turns the tiles
	 * to the part's other face, for the copy on the far side, which symmetry turns half round.
	 */
	tiled: z.boolean().default(false),
	tilesUp: z.boolean().default(false)
});
export type WingConfig = z.output<typeof wingConfigSchema>;
export interface WingState {
	/** 0, 0.5 or 1 of full flap. */
	flap: number;
	/** The tiles are on the part's +Z face (a tiled wing, plan 356). */
	tilesUp?: boolean;
}

/** Thin-airfoil slope of a flat plate, per radian (`a0 = 2 pi`). */
const THIN_AIRFOIL_SLOPE = 2 * Math.PI;

/** Lift-curve slope of the finite wing per radian: `a0 / (1 + a0 / (pi e AR))` (research wings-struts-fuel-lines). */
export const wingLiftSlope = (config: WingConfig): number =>
	THIN_AIRFOIL_SLOPE /
	(1 + THIN_AIRFOIL_SLOPE / (Math.PI * config.efficiency * config.aspectRatio));

/**
 * Lift and drag coefficients at angle of attack `alpha` (rad, -pi/2..pi/2; positive when the plate
 * moves towards its +Z face, so the lift acts towards -Z): `C_L = a alpha` up to the stall angle, then it
 * falls to zero broadside along `(1 + cos(pi t)) / 2`; `C_D = C_D0 + C_L² / (pi e AR)` plus the
 * broadside plate drag `crossflow sin² alpha`, blended in over 0.1 rad past the stall (ADR 0075).
 */
export function wingCoefficients(
	config: WingConfig,
	alpha: number,
	flap = 0
): { cl: number; cd: number } {
	const a = wingLiftSlope(config);
	const stall = ((config.stallAngle - config.flapStall * flap) * Math.PI) / 180;
	const abs = Math.abs(alpha);
	let cl: number;
	// flaps add camber: a lift offset that follows the curve up to the stall and fades with it
	const camber = config.flapLift * flap;
	if (abs <= stall) cl = a * alpha + camber;
	else {
		const t = Math.min(1, (abs - stall) / (Math.PI / 2 - stall));
		cl = (Math.sign(alpha) * a * stall + camber) * 0.5 * (1 + Math.cos(Math.PI * t));
	}
	const blend = Math.min(1, Math.max(0, (abs - stall) / 0.1));
	const smooth = blend * blend * (3 - 2 * blend);
	const induced = (cl * cl) / (Math.PI * config.efficiency * config.aspectRatio);
	const plate = config.crossflow * Math.sin(alpha) * Math.sin(alpha) * smooth;
	return { cl, cd: config.parasiteDrag + config.flapDrag * flap + induced + plate };
}

/**
 * Force of the wing in the part frame for the air velocity `v` of its aerodynamic centre in
 * density `rho` (ADR 0075). The plate lies in the X-Y plane like a fin (span along X, chord along
 * Y, normal Z); only the flow in the Y-Z section counts, so a spanwise flow makes neither lift nor
 * drag. `alpha` is the angle of the section flow to the chord, lift is perpendicular to the flow
 * and drag along it.
 */
export function wingForce(config: WingConfig, v: Vec3, rho: number, flap = 0): Vec3 {
	const section = Math.hypot(v.y, v.z);
	if (section === 0 || rho === 0) return { x: 0, y: 0, z: 0 };
	const alpha = Math.atan2(v.z, Math.abs(v.y));
	const { cl, cd } = wingCoefficients(config, alpha, flap);
	const q = 0.5 * rho * section * section * config.area;
	const ey = v.y / section;
	const ez = v.z / section;
	const side = v.y < 0 ? -1 : 1;
	// Lift direction: perpendicular to the flow, towards -Z for a positive angle of attack.
	const ly = side * ez;
	const lz = -Math.abs(ey);
	return { x: 0, y: q * (cl * ly - cd * ey), z: q * (cl * lz - cd * ez) };
}

const wingInfo = (config: WingConfig): ModuleInfo => ({
	lift: {
		area: config.area,
		liftSlope: wingLiftSlope(config),
		crossflow: config.crossflow,
		centre: [config.centre[0], config.centre[1], config.centre[2]]
	},
	category: 'aero'
});

/**
 * A lifting wing (ADR 0075): the fin's geometry with a finite-wing lift slope from its aspect
 * ratio, a stall and an induced drag, so a craft with wings glides. Turn the part about its span
 * (a tilt, ADR 0071) for incidence.
 */
export const ModuleWing = defineModule({
	id: 'stock.wing',
	config: wingConfigSchema,
	state: (config): WingState => ({ flap: 0, ...(config.tiled ? { tilesUp: config.tilesUp } : {}) }),
	describe: (config, state) => ({
		...wingInfo(config),
		...(config.tiled
			? {
					actions: [
						{
							id: 'setTilesUp',
							label: 'Heat tiles on top (the far wing)',
							kind: 'toggle' as const,
							value: config.tilesUp,
							enabled: true,
							icon: 'wing',
							buildOnly: true,
							build: 'tilesUp'
						}
					]
				}
			: config.flapLift > 0
				? {
						actions: [
							{
								id: 'setFlaps',
								label: 'Flaps',
								kind: 'mode' as const,
								value: String(state.flap ?? 0),
								options: [
									{ value: '0', label: 'Up' },
									{ value: '0.5', label: 'Half' },
									{ value: '1', label: 'Full' }
								],
								enabled: true,
								group: 'stock.flaps',
								icon: 'wing'
							}
						]
					}
				: {})
	}),
	actions: {
		/** `('0' | '0.5' | '1')`: the flap setting (plan 063, ADR 0161 point 4). */
		setFlaps: (ctx, ...args) => {
			const [value] = z.tuple([z.enum(['0', '0.5', '1'])]).parse(args);
			if (ctx.config.flapLift > 0) ctx.state.flap = Number(value);
		},
		// a build setting only (the Hangar writes `tilesUp`)
		setTilesUp: () => {}
	},
	snapshot: (state) => ({
		flap: state.flap,
		...(state.tilesUp !== undefined ? { tilesUp: state.tilesUp } : {})
	}),
	update(ctx) {
		const { config, vessel } = ctx;
		const rho = vessel.ambient.density;
		if (rho === 0) return;
		const at = { x: config.centre[0], y: config.centre[1], z: config.centre[2] };
		const v = vessel.airVelocity(at);
		const force = wingForce(config, v, rho, ctx.state.flap ?? 0);
		if (config.damping > 0) {
			const speed = Math.hypot(v.x, v.y, v.z);
			force.z += finDampingForce(
				{ area: config.area, liftSlope: wingLiftSlope(config), damping: config.damping },
				speed,
				rho,
				rotationalNormalFlow(vessel, at)
			);
		}
		if (force.y !== 0 || force.z !== 0) vessel.applyForce(force, at);
	}
});

// ---------------------------------------------------------------------------------------------
// CO2 scrubber (plan 107, ADR 0181 point 1)
// ---------------------------------------------------------------------------------------------

export const scrubberConfigSchema = z.object({
	/** People it serves. */
	crew: z.number().positive(),
	/** Electric charge per served person per day, EC. */
	charge: z.number().nonnegative()
});

/** Scrubs the CO2 of up to `crew` people while the vessel has electric charge (life support `full`). */
export const ModuleScrubber = defineModule({
	id: 'stock.scrubber',
	config: scrubberConfigSchema,
	scrubber: (config) => ({ crew: config.crew, charge: config.charge }),
	describe: () => ({ category: 'command' })
});

// ---------------------------------------------------------------------------------------------
// Wheel (plan 063, ADR 0161 points 1 and 2)
// ---------------------------------------------------------------------------------------------

export const wheelConfigSchema = z.object({
	/** Wheel radius, m. */
	radius: z.number().positive().default(0.3),
	/** Tyre width, m. */
	width: z.number().positive().default(0.15),
	/** Centre of the wheel in the part frame, m (out along the part's +X on a radial part). */
	offset: z.tuple([z.number(), z.number(), z.number()]).default([0.45, 0, 0]),
	/** Rolling resistance coefficient. */
	rolling: z.number().nonnegative().default(0.02),
	/** Side grip coefficient (and the brakes' friction). */
	grip: z.number().positive().default(0.8),
	/** Steering angle at full yaw demand, degrees (0: a fixed wheel). */
	steer: z.number().min(0).max(45).default(0),
	/** Motor force at full throttle, N (plan 260; 0: no motor). */
	driveForce: z.number().nonnegative().default(0),
	/** Electric charge drawn per second at full drive, EC/s. */
	driveCharge: z.number().nonnegative().default(0),
	/** The motor's force fades to nothing at this rolling speed, m/s (plan 307; 0: no limit). */
	topSpeed: z.number().nonnegative().default(0),
	/** The motor starts on (plan 307: a rover wheel; landing gear starts off). */
	motorOn: z.boolean().default(false),
	/**
	 * Retractable gear (plan 361): stowed, the wheel has no collider and the strut is folded away;
	 * the Landing gear group (G) lowers and raises it. `deployed` is how it is built.
	 */
	retractable: z.boolean().default(false),
	deployed: z.boolean().default(false),
	/** Above this airspeed it will not lower, m/s (0: no limit). */
	deploySpeed: z.number().nonnegative().default(0)
});
export type WheelConfig = z.output<typeof wheelConfigSchema>;
export interface WheelState {
	brakes: boolean;
	/** The wheel steers with yaw (plan 241); absent: it does when it can. */
	steering?: boolean;
	/** Steering turns the other way (plan 241). */
	invert?: boolean;
	/** The motor drives with the vessel throttle (plan 260); absent: off. */
	motor?: boolean;
	/** Share of the motor's force it may use, 0..1 (absent: 1). */
	motorLimit?: number;
	/** The motor turns the wheel backwards. */
	reverse?: boolean;
	/** The share of the electric charge it asked for that it got last step (absent: 1). */
	powered?: number;
	/** Retractable gear (plan 361): lowered. Absent on a fixed wheel. */
	deployed?: boolean;
	/** Too fast to lower the gear now (plan 361). */
	tooFast?: boolean;
}

/** A fixed wheel is always down; retractable gear only when lowered (plan 361). */
const wheelDown = (config: Pick<WheelConfig, 'retractable'>, state: WheelState): boolean =>
	!config.retractable || state.deployed === true;

/** The motor's force at full throttle, N: 0 while it is off, powerless or absent (plan 260). */
export const wheelDrive = (
	config: Pick<WheelConfig, 'driveForce'>,
	state: Pick<WheelState, 'motor' | 'motorLimit' | 'reverse' | 'powered'>
): number =>
	config.driveForce > 0 && state.motor === true
		? config.driveForce * (state.motorLimit ?? 1) * (state.powered ?? 1) * (state.reverse ? -1 : 1)
		: 0;

/** The steering angle sign: 0 when the wheel does not steer, -1 when inverted. */
export const wheelSteerSign = (config: Pick<WheelConfig, 'steer'>, state: WheelState): number =>
	config.steer > 0 && state.steering !== false ? (state.invert === true ? -1 : 1) : 0;

/**
 * A wheel (ADR 0161): one frictionless box at `offset`, rolling along the part's +Y; the sim applies
 * the rolling resistance, the side grip and the brakes at its ground contact.
 */
export const ModuleWheel = defineModule({
	id: 'stock.wheel',
	config: wheelConfigSchema,
	state: (config): WheelState => ({
		brakes: false,
		...(config.motorOn ? { motor: true } : {}),
		...(config.retractable ? { deployed: config.deployed } : {})
	}),
	describe: (config, state) => ({
		category: 'landing',
		actions: [
			...(config.retractable
				? [
						{
							id: 'setDeployed',
							label: 'Landing gear',
							kind: 'toggle' as const,
							value: state.deployed === true,
							enabled: state.deployed === true || state.tooFast !== true,
							...(state.deployed !== true && state.tooFast === true
								? { reason: `too fast to lower it (above ${config.deploySpeed} m/s)` }
								: {}),
							group: 'stock.landing-gear',
							icon: 'legs' as const,
							// the Hangar sets how it is built (plan 316)
							build: 'deployed'
						}
					]
				: []),
			{
				id: 'setBrakes',
				label: config.steer > 0 ? 'Brakes (steering wheel)' : 'Brakes',
				kind: 'toggle',
				value: state.brakes,
				enabled: true,
				group: 'stock.brakes',
				icon: 'legs'
			},
			...(config.driveForce > 0
				? [
						{
							id: 'setMotor',
							label: 'Motor',
							kind: 'toggle' as const,
							value: state.motor === true,
							enabled: true,
							group: 'stock.motors'
						},
						{
							id: 'setMotorLimit',
							label: 'Motor limit',
							kind: 'value' as const,
							value: state.motorLimit ?? 1,
							min: 0,
							max: 1,
							step: 0.05,
							units: [{ unit: '%', factor: 100 }],
							enabled: state.motor === true
						},
						{
							id: 'setReverse',
							label: 'Reverse',
							kind: 'toggle' as const,
							value: state.reverse === true,
							more: true,
							enabled: state.motor === true
						}
					]
				: []),
			...(config.steer > 0
				? [
						{
							id: 'setSteering',
							label: 'Steering',
							kind: 'toggle' as const,
							value: state.steering !== false,
							enabled: true
						},
						{
							id: 'setInvert',
							label: 'Invert steering',
							kind: 'toggle' as const,
							value: state.invert === true,
							more: true,
							enabled: state.steering !== false
						}
					]
				: [])
		]
	}),
	colliders: (config, state) =>
		wheelDown(config, state)
			? [
					{
						offset: { x: config.offset[0], y: config.offset[1], z: config.offset[2] },
						// the rolling direction (+Y) and out (+X) span the wheel's disc; its width is along Z
						halfExtents: { x: config.radius, y: config.radius, z: config.width / 2 },
						wheel: {
							rolling: config.rolling,
							grip: config.grip,
							brake: state.brakes ? 1 : 0,
							steer: (config.steer * wheelSteerSign(config, state) * Math.PI) / 180,
							drive: wheelDrive(config, state),
							...(config.topSpeed > 0 ? { topSpeed: config.topSpeed } : {})
						}
					}
				]
			: [],
	/** The motor draws electric charge in proportion to the throttle and its limit (plan 260). */
	update(ctx, dt) {
		const { config, state, vessel } = ctx;
		if (config.retractable && config.deploySpeed > 0) {
			const air = vessel.airVelocity();
			state.tooFast = Math.hypot(air.x, air.y, air.z) > config.deploySpeed;
		}
		if (config.driveForce <= 0 || state.motor !== true) {
			delete state.powered;
			return;
		}
		const demand =
			Math.abs(vessel.control.wheelThrottle || vessel.control.throttle) * (state.motorLimit ?? 1);
		const need = config.driveCharge * demand * dt;
		if (need <= 0) {
			state.powered = 1;
			return;
		}
		state.powered = vessel.resources.withdraw(ElectricCharge.id, need) / need;
	},
	actions: {
		/** `(on)`: the motor drives with the throttle (plan 260). */
		setMotor: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.motor = on;
		},
		/** `(limit)` 0..1 of the motor's force. */
		setMotorLimit: (ctx, ...args) => {
			const [v] = z.tuple([z.number().min(0).max(1)]).parse(args);
			ctx.state.motorLimit = v;
		},
		/** `(on)`: drive backwards. */
		setReverse: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.reverse = on;
		},
		/** `(down)`: lowers or raises retractable gear; it will not lower when too fast (plan 361). */
		setDeployed: (ctx, ...args) => {
			const [down] = z.tuple([z.boolean()]).parse(args);
			if (!ctx.config.retractable) return;
			if (down && ctx.state.tooFast === true) return;
			ctx.state.deployed = down;
		},
		/** `(on)`: the brakes. */
		setBrakes: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.brakes = on;
		},
		/** `(on)`: the wheel answers yaw (plan 241). */
		setSteering: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.steering = on;
		},
		/** `(on)`: steering turns the other way. */
		setInvert: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.invert = on;
		}
	},
	snapshot: (state) => ({
		brakes: state.brakes,
		...(state.deployed !== undefined ? { deployed: state.deployed } : {}),
		...(state.tooFast === true ? { tooFast: true } : {}),
		...(state.invert === true ? { invert: true } : {}),
		...(state.motor === true ? { motor: true } : {}),
		...(state.motorLimit !== undefined && state.motorLimit !== 1
			? { motorLimit: state.motorLimit }
			: {}),
		...(state.reverse === true ? { reverse: true } : {})
	})
});
