/**
 * Stock modules. Each defines a config schema, serializable state and the state transitions that
 * need nothing but that state (`onStage`, `actions`, `snapshot`). Effects on the physics backend
 * or on other parts (thrust force, propellant flow, splitting a vessel, wheel torque) are applied
 * by the sim from this config and state; the arithmetic lives in `engine.ts` and below, so it is
 * written once. See docs/guides/writing-a-mod.md and journal 006 for the full contract.
 */
import { defineModule, z } from '@orbital/sdk';

/** Resource keys are definition ids, e.g. `stock.liquid-fuel`. */
const resourceKey = z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/, 'resource id');

// ---------------------------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------------------------

/**
 * Marks a part as a control source: a vessel is controllable while it contains a command part.
 * No config, no state.
 */
export const ModuleCommand = defineModule({ id: 'stock.command' });

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

export const ModuleDecoupler = defineModule({
	id: 'stock.decoupler',
	config: decouplerConfigSchema,
	state: (): DecouplerState => ({ decoupled: false }),
	onStage(ctx) {
		ctx.state.decoupled = true;
	},
	actions: {
		decouple: (ctx) => {
			ctx.state.decoupled = true;
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
	actions: {
		/** `(enabled)`. */
		setEnabled: (ctx, ...args) => {
			const [enabled] = z.tuple([z.boolean()]).parse(args);
			ctx.state.enabled = enabled;
		}
	},
	snapshot: (state) => ({ enabled: state.enabled })
});
