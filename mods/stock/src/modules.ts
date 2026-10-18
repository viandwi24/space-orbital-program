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
export const commandConfigSchema = z.object({
	/**
	 * Electric charge per second the source draws (plan 208, ADR 0213): a probe core's computer.
	 * A source with a drain is no control source while the vessel has no EC; 0 (a crewed pod) never
	 * needs power to be steered.
	 */
	drain: z.number().nonnegative().default(0)
}).prefault({});

/** Draws the drain for `dt` seconds; what is missing is simply not there (the control check sees 0 EC). */
function commandDrain(
	ctx: {
		config: z.output<typeof commandConfigSchema>;
		vessel: { resources: { withdraw(resource: string, amount: number): number } };
	},
	dt: number
): void {
	if (ctx.config.drain > 0 && dt > 0)
		ctx.vessel.resources.withdraw(ElectricCharge.id, ctx.config.drain * dt);
}

export const ModuleCommand = defineModule({
	id: 'stock.command',
	config: commandConfigSchema,
	controlSource: true,
	needs: (config) => (config.drain > 0 ? ElectricCharge.id : undefined),
	describe: () => ({ category: 'command' }),
	update: commandDrain,
	background: commandDrain
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
}

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

export const ModuleResourceContainer = defineModule({
	id: 'stock.resource-container',
	config: containerConfigSchema,
	describe: () => ({ category: 'tanks' }),
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
		deposit: (config, state, resource, amount) => deposit(config, state, resource, amount)
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
		}
	},
	snapshot: (state) => ({ amounts: { ...state.amounts } })
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
			.default({ range: 0, rate: 20 })
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
}

/**
 * Move the thrust vector towards the angles the mixer asks for (ADR 0045); a cold or idle engine,
 * or one without gimbal, relaxes to the axis at the same rate. Reads the centre of mass only when
 * there is a range to steer with.
 */
function steerGimbal(
	ctx: { config: EngineConfig; state: EngineState; vessel: VesselApi },
	dt: number
): void {
	const { config, state, vessel } = ctx;
	const step = (config.gimbal.rate * Math.PI * dt) / 180;
	const range = (config.gimbal.range * Math.PI) / 180;
	const live = range > 0 && state.ignited && state.throttle > 0;
	const [tx, tz] = live
		? gimbalTarget(vessel.centreOfMass, vessel.torqueDemand, range)
		: ([0, 0] as const);
	state.gimbal = [slew(state.gimbal[0], tx, step), slew(state.gimbal[1], tz, step)];
}

export const ModuleEngine = defineModule({
	id: 'stock.engine',
	config: engineConfigSchema,
	state: (): EngineState => ({ ignited: false, throttle: 0, flameout: false, gimbal: [0, 0] }),
	// What tools (stage delta-v) may know without running the sim (ADR 0033): the flow is fixed by
	// the vacuum rating and thrust follows Isp(p) (`engineOutput`), so two curve points are exact.
	describe: (config, state) => ({
		engine: {
			massFlow: config.thrust / (config.ispVacuum * G0),
			thrust: [
				{ pressure: 0, thrust: config.thrust },
				{
					pressure: SEA_LEVEL_PRESSURE,
					thrust: (config.thrust * ispAt(config, SEA_LEVEL_PRESSURE)) / config.ispVacuum
				}
			],
			propellants: config.propellants.map((p) => ({ resource: p.resource, ratio: p.ratio })),
			ignited: state.ignited,
			flameout: state.flameout,
			throttle: Math.min(1, Math.max(0, state.throttle))
		},
		category: 'propulsion',
		actions: [
			{
				id: 'setActive',
				label: 'Engine',
				kind: 'toggle',
				value: state.ignited,
				enabled: true,
				group: 'stock.engines',
				icon: 'engine'
			}
		]
	}),
	onStage(ctx) {
		ctx.state.ignited = true;
		ctx.state.flameout = false;
	},
	/** Thrust times the lever of the bell about the centre of mass (ADR 0049); nothing when cold or fixed. */
	controlAuthority({ config, state, vessel }) {
		const range = (config.gimbal.range * Math.PI) / 180;
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
		if (!state.ignited) return;
		const out = engineOutput(config, state, vessel.ambient.pressure);
		if (out.massFlow <= 0) return;
		const rates = propellantRates(
			config,
			out.massFlow,
			(resource) => ctx.registries.resources.get(resource)?.density ?? 0
		);
		let satisfied = 1;
		for (const { resource, rate } of rates) {
			satisfied = Math.min(satisfied, vessel.resources.amount(resource) / (rate * dt));
		}
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
			ctx.events.emit('stock:engine-flameout', { part: ctx.entity });
		}
	},
	actions: {
		activate: (ctx) => {
			ctx.state.ignited = true;
			ctx.state.flameout = false;
		},
		shutdown: (ctx) => {
			ctx.state.ignited = false;
		},
		/** `(on)`: activate or shut down (the part action toggle, plan 110). */
		setActive: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.ignited = on;
			if (on) ctx.state.flameout = false;
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
		gimbal: [state.gimbal[0], state.gimbal[1]]
	})
});

// ---------------------------------------------------------------------------------------------
// Decoupler
// ---------------------------------------------------------------------------------------------

export const decouplerConfigSchema = z.object({
	/** Which attach node is severed: the part attached there leaves with its subtree. */
	separates: z.enum(['top', 'bottom', 'radial']).default('top'),
	/** Total impulse pushing the two halves apart, N·s (split by the sim, equal and opposite). */
	ejectionImpulse: z.number().nonnegative().default(2_000)
});
export type DecouplerConfig = z.output<typeof decouplerConfigSchema>;
export interface DecouplerState {
	/** True once fired. The sim performs the split when it sees the flag flip. */
	decoupled: boolean;
}

/** Fire once: mark the state and ask the vessel to sever the configured node with the ejection impulse. */
function fire(ctx: {
	config: DecouplerConfig;
	state: DecouplerState;
	vessel: { detach(node: string, impulse?: number): void };
}): void {
	if (ctx.state.decoupled) return;
	ctx.state.decoupled = true;
	ctx.vessel.detach(ctx.config.separates, ctx.config.ejectionImpulse);
}

export const ModuleDecoupler = defineModule({
	id: 'stock.decoupler',
	config: decouplerConfigSchema,
	state: (): DecouplerState => ({ decoupled: false }),
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
			}
		]
	}),
	onStage(ctx) {
		fire(ctx);
	},
	actions: {
		decouple: (ctx) => {
			fire(ctx);
		}
	},
	snapshot: (state) => ({ decoupled: state.decoupled })
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
export interface ReactionWheelState {
	enabled: boolean;
}

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
			}
		]
	}),
	/** `torque` about every axis while enabled and powered (ADR 0049). */
	controlAuthority({ state, config, vessel }) {
		const powered = config.chargeRate <= 0 || vessel.resources.amount(ElectricCharge.id) > 0;
		const t = state.enabled && powered ? config.torque : 0;
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
		}
	},
	snapshot: (state) => ({ enabled: state.enabled })
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
	deployed: z.boolean().default(false)
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
	config: LandingLegConfig,
	state: LandingLegState
): {
	offset: { x: number; y: number; z: number };
	halfExtents: { x: number; y: number; z: number };
}[] {
	if (!state.deployed) return [];
	const h = config.footSize / 2;
	const halfExtents = { x: h, y: h, z: h };
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
	describe: () => ({ category: 'thermal' }),
	state: (config): HeatShieldState => ({ ablator: config.ablator }),
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
}

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
	// At rest a control surface is a fin (the stability read-out of the editor).
	describe: (config) => finInfo(config),
	/** The force change over the full range in the present airflow, times the lever (ADR 0049). */
	controlAuthority({ config, vessel }) {
		const rho = vessel.ambient.density;
		if (rho === 0) return { x: 0, y: 0, z: 0 };
		const at = { x: config.centre[0], y: config.centre[1], z: config.centre[2] };
		const v = vessel.airVelocity(at);
		const max = (config.maxDeflection * Math.PI) / 180;
		const neutral = controlSurfaceForce(config, v, rho, 0);
		const full = controlSurfaceForce(config, v, rho, max);
		return surfaceAuthority(at, vessel.centreOfMass, {
			x: full.x - neutral.x,
			y: full.y - neutral.y,
			z: full.z - neutral.z
		});
	},
	update(ctx, dt) {
		const { config, state, vessel } = ctx;
		const at = { x: config.centre[0], y: config.centre[1], z: config.centre[2] };
		const v = vessel.airVelocity(at);
		const rho = vessel.ambient.density;
		const max = (config.maxDeflection * Math.PI) / 180;
		const target = surfaceTarget(at, vessel.centreOfMass, vessel.torqueDemand, max, v.y <= 0);
		state.deflection = slew(state.deflection, target, (config.deflectionRate * Math.PI * dt) / 180);
		if (rho === 0) return;
		const force = controlSurfaceForce(config, v, rho, state.deflection);
		if (config.damping > 0) {
			const speed = Math.hypot(v.x, v.y, v.z);
			force.z += finDampingForce(config, speed, rho, rotationalNormalFlow(vessel, at));
		}
		vessel.applyForce(force, at);
	},
	snapshot: (state) => ({ deflection: state.deflection })
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
	flapStall: z.number().nonnegative().max(20).default(0)
});
export type WingConfig = z.output<typeof wingConfigSchema>;
export interface WingState {
	/** 0, 0.5 or 1 of full flap. */
	flap: number;
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
	state: (): WingState => ({ flap: 0 }),
	describe: (config, state) => ({
		...wingInfo(config),
		...(config.flapLift > 0
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
		}
	},
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
	steer: z.number().min(0).max(45).default(0)
});
export type WheelConfig = z.output<typeof wheelConfigSchema>;
export interface WheelState {
	brakes: boolean;
}

/**
 * A wheel (ADR 0161): one frictionless box at `offset`, rolling along the part's +Y; the sim applies
 * the rolling resistance, the side grip and the brakes at its ground contact.
 */
export const ModuleWheel = defineModule({
	id: 'stock.wheel',
	config: wheelConfigSchema,
	state: (): WheelState => ({ brakes: false }),
	describe: (config, state) => ({
		category: 'landing',
		actions: [
			{
				id: 'setBrakes',
				label: config.steer > 0 ? 'Brakes (steering wheel)' : 'Brakes',
				kind: 'toggle',
				value: state.brakes,
				enabled: true,
				group: 'stock.brakes',
				icon: 'legs'
			}
		]
	}),
	colliders: (config, state) => [
		{
			offset: { x: config.offset[0], y: config.offset[1], z: config.offset[2] },
			// the rolling direction (+Y) and out (+X) span the wheel's disc; its width is along Z
			halfExtents: { x: config.radius, y: config.radius, z: config.width / 2 },
			wheel: {
				rolling: config.rolling,
				grip: config.grip,
				brake: state.brakes ? 1 : 0,
				steer: (config.steer * Math.PI) / 180
			}
		}
	],
	actions: {
		/** `(on)`: the brakes. */
		setBrakes: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.brakes = on;
		}
	},
	snapshot: (state) => ({ brakes: state.brakes })
});
