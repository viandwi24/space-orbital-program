/**
 * Stock modules. Each defines a config schema, serializable state and hooks. Effects on the
 * vessel (thrust, wheel torque, propellant draw, separation) go through `ctx.vessel`, the generic
 * capability API every mod gets (ADR 0015); the arithmetic lives in `engine.ts` and below, so it is
 * written once. See docs/guides/writing-a-mod.md.
 */
import { defineModule, z, type EntityId } from '@orbital/sdk';
import { engineOutput, propellantRates } from './engine.ts';
import { ElectricCharge } from './resources.ts';

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
export const ModuleCommand = defineModule({ id: 'stock.command', controlSource: true });

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
		propellants: z.array(z.object({ resource: resourceKey, ratio: z.number().positive() })).min(1)
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
}

export const ModuleEngine = defineModule({
	id: 'stock.engine',
	config: engineConfigSchema,
	state: (): EngineState => ({ ignited: false, throttle: 0, flameout: false }),
	onStage(ctx) {
		ctx.state.ignited = true;
		ctx.state.flameout = false;
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
		if (satisfied > 0) vessel.applyForce({ x: 0, y: out.thrust * satisfied, z: 0 });
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
		flameout: state.flameout
	})
});

// ---------------------------------------------------------------------------------------------
// Decoupler
// ---------------------------------------------------------------------------------------------

export const decouplerConfigSchema = z.object({
	/** Which attach node is severed: the part attached there leaves with its subtree. */
	separates: z.enum(['top', 'bottom']).default('top'),
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
		}
	},
	snapshot: (state) => ({ deployed: state.deployed })
});
