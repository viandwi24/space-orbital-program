/**
 * Part-support modules for the parts of plans 280–298 (plan 302):
 * - `stock.animate`: a generic open/close toggle (a telescope's aperture door, a dish that unfolds,
 *   payload petals, an airbrake), with an action group, an optional staging step and a progress the
 *   model animates by (`visual.deploy` on the flag `open`).
 * - `stock.bay`: doors that close a hollow part. Closed, the bay's shell shields the parts inside
 *   from drag and heat, as a fairing does (ADR 0224, ADR 0261); open, it does not.
 * - `stock.fuel-cell`: liquid fuel and oxidizer in, electric charge out, while running.
 */
import { defineModule, z } from '@orbital/sdk';
import { ElectricCharge, LiquidFuel, Oxidizer } from './resources.ts';

export const animateConfigSchema = z.object({
	/** What the panel calls the moving piece ("Aperture door", "Petals"). */
	label: z.string().min(1).default('Deploy'),
	/** Words for the two states in the part panel. */
	openLabel: z.string().min(1).default('Open'),
	closedLabel: z.string().min(1).default('Closed'),
	/** Whether it starts open. */
	open: z.boolean().default(false),
	/** Staging opens it (KSP: a part may be added to the staging stack). */
	stageable: z.boolean().default(false),
	/** Seconds to open or close (the model's animation follows it). */
	seconds: z.number().positive().default(2)
});
export type AnimateConfig = z.output<typeof animateConfigSchema>;
export interface AnimateState {
	open: boolean;
}

export const ModuleAnimate = defineModule({
	id: 'stock.animate',
	config: animateConfigSchema,
	state: (config): AnimateState => ({ open: config.open }),
	describe: (config, state) => ({
		category: 'stock.other',
		actions: [
			{
				id: 'setOpen',
				label: `${config.label}: ${state.open ? config.openLabel : config.closedLabel}`,
				kind: 'toggle',
				value: state.open,
				enabled: true,
				group: 'stock.animate',
				icon: 'deploy',
				// the Hangar sets how it starts (plan 316)
				build: 'open'
			}
		]
	}),
	onStage(ctx) {
		if (ctx.config.stageable) ctx.state.open = true;
	},
	actions: {
		open: (ctx) => {
			ctx.state.open = true;
		},
		close: (ctx) => {
			ctx.state.open = false;
		},
		/** `(open)` (the part action toggle). */
		setOpen: (ctx, ...args) => {
			const [open] = z.tuple([z.boolean()]).parse(args);
			ctx.state.open = open;
		}
	},
	snapshot: (state) => ({ open: state.open })
});

export const bayConfigSchema = z.object({
	/** The hollow inside, bottom to top in the part frame: `y` and inner radius `r`, m. */
	profile: z
		.array(z.object({ y: z.number(), r: z.number().positive() }))
		.min(2)
		.max(16),
	/** Doors start open (a bay built open in the Hangar). */
	open: z.boolean().default(false),
	stageable: z.boolean().default(false),
	/**
	 * Single use (plan 345): opening throws the panels off as debris, as the Apollo SLA's petals
	 * and a fairing do; a cargo bay's doors (absent) stay on their hinges and close again.
	 */
	jettison: z
		.object({
			/** One debris part per panel, round the axis from +Z, each centred on its own sector. */
			panels: z.array(z.string().min(1)).min(1).max(8),
			/** The panels' mass together, kg: it leaves the part with them. */
			mass: z.number().nonnegative(),
			/** How far from the axis the panels' centres start, m (just outside the shell). */
			radius: z.number().positive(),
			/** Their speed away from the axis, m/s: a gentle spring push. */
			push: z.number().nonnegative().default(0.8)
		})
		.optional()
});
export type BayConfig = z.output<typeof bayConfigSchema>;
export interface BayState {
	open: boolean;
	/** The panels are gone (a single-use bay, plan 345). */
	jettisoned?: boolean;
}

type BayContext = {
	config: BayConfig;
	state: BayState;
	vessel: {
		spawnDebris?(spec: {
			part: string;
			offset: { x: number; y: number; z: number };
			velocity: { x: number; y: number; z: number };
		}): void;
	};
};

/**
 * Open the doors; a single-use bay throws its panels off at once (plan 345): each leaves from its
 * own sector, outside the shell so it starts clear of the payload, pushed straight out. The pushes
 * cancel, so the vessel and what it carries keep their motion.
 */
function openBay(ctx: BayContext): void {
	const { config, state } = ctx;
	state.open = true;
	const j = config.jettison;
	if (!j || state.jettisoned) return;
	state.jettisoned = true;
	const n = j.panels.length;
	j.panels.forEach((part, i) => {
		const a = ((i + 0.5) / n) * Math.PI * 2;
		const out = { x: Math.sin(a), y: 0, z: Math.cos(a) };
		ctx.vessel.spawnDebris?.({
			part,
			offset: { x: out.x * j.radius, y: 0, z: out.z * j.radius },
			velocity: { x: out.x * j.push, y: 0, z: out.z * j.push }
		});
	});
}

/**
 * A bay with doors (plan 302, ADR 0261). While its doors are closed it is a closed shell: the parts
 * inside take no drag and no convective heat, as inside a fairing. A single-use bay (plan 345)
 * throws its panels off when it opens.
 */
export const ModuleBay = defineModule({
	id: 'stock.bay',
	config: bayConfigSchema,
	state: (config): BayState => ({
		open: config.open,
		...(config.jettison ? { jettisoned: false } : {})
	}),
	describe: (config, state) => ({
		category: 'stock.other',
		...(config.jettison
			? {
					readouts: [
						{
							id: 'jettison',
							label: 'Panels',
							value: state.jettisoned ? 'Thrown off' : 'Thrown off when opened (single use)'
						}
					]
				}
			: {}),
		actions: [
			config.jettison
				? {
						id: 'open',
						label: state.jettisoned ? 'Panels thrown off' : 'Jettison panels',
						kind: 'trigger',
						enabled: !state.jettisoned,
						...(state.jettisoned ? { reason: 'already thrown off' } : {}),
						group: 'stock.bay',
						icon: 'deploy'
					}
				: {
						id: 'setOpen',
						label: 'Bay doors',
						kind: 'toggle',
						value: state.open,
						enabled: true,
						group: 'stock.bay',
						icon: 'deploy',
						// the Hangar sets how it starts (plan 316)
						build: 'open'
					}
		]
	}),
	shell: (config, state) => (state.open ? null : config.profile),
	mass: (config, state) => (config.jettison && !state.jettisoned ? config.jettison.mass : 0),
	onStage(ctx) {
		if (ctx.config.stageable) openBay(ctx);
	},
	actions: {
		open: (ctx) => openBay(ctx),
		close: (ctx) => {
			// thrown-off panels do not come back
			if (!ctx.config.jettison) ctx.state.open = false;
		},
		setOpen: (ctx, ...args) => {
			const [open] = z.tuple([z.boolean()]).parse(args);
			if (open) openBay(ctx);
			else if (!ctx.config.jettison) ctx.state.open = false;
		}
	},
	snapshot: (state) => ({ open: state.open, ...(state.jettisoned ? { jettisoned: true } : {}) })
});

export const fuelCellConfigSchema = z.object({
	/** Electric charge made while running, EC/s. */
	rate: z.number().positive().default(1.5),
	/** Liquid fuel burnt per EC, u (KSP: 0.0016875 LF and 0.0020625 Ox per EC). */
	fuelPerCharge: z.number().positive().default(0.0016875),
	oxidizerPerCharge: z.number().positive().default(0.0020625),
	/** Starts running. */
	running: z.boolean().default(false)
});
export type FuelCellConfig = z.output<typeof fuelCellConfigSchema>;
export interface FuelCellState {
	running: boolean;
	/** The last step had no fuel. */
	starved: boolean;
}

/**
 * A fuel cell (plan 302): while running it burns liquid fuel and oxidizer to make electric charge,
 * at a fixed rate whatever the light, the Apollo service module's power.
 */
export const ModuleFuelCell = defineModule({
	id: 'stock.fuel-cell',
	config: fuelCellConfigSchema,
	state: (config): FuelCellState => ({ running: config.running, starved: false }),
	describe: (_config, state) => ({
		category: 'stock.other',
		actions: [
			{
				id: 'setRunning',
				label: 'Fuel cell',
				kind: 'toggle',
				value: state.running,
				enabled: true,
				group: 'stock.fuel-cell',
				icon: 'solar',
				// the Hangar sets how it starts (plan 316)
				build: 'running'
			}
		]
	}),
	update: (ctx, dt) => {
		if (!ctx.state.running || dt <= 0) {
			ctx.state.starved = false;
			return;
		}
		const ec = ctx.config.rate * dt;
		const needFuel = ec * ctx.config.fuelPerCharge;
		const needOx = ec * ctx.config.oxidizerPerCharge;
		const fuel = ctx.vessel.resources.withdraw(LiquidFuel.id, needFuel);
		const ox = ctx.vessel.resources.withdraw(Oxidizer.id, needOx);
		const scale = Math.min(needFuel > 0 ? fuel / needFuel : 1, needOx > 0 ? ox / needOx : 1);
		// what was taken beyond the scarcer one goes back
		if (fuel > needFuel * scale)
			ctx.vessel.resources.deposit(LiquidFuel.id, fuel - needFuel * scale);
		if (ox > needOx * scale) ctx.vessel.resources.deposit(Oxidizer.id, ox - needOx * scale);
		ctx.state.starved = scale < 1e-6;
		if (scale > 0) ctx.vessel.resources.deposit(ElectricCharge.id, ec * scale);
	},
	actions: {
		start: (ctx) => {
			ctx.state.running = true;
		},
		stop: (ctx) => {
			ctx.state.running = false;
		},
		setRunning: (ctx, ...args) => {
			const [running] = z.tuple([z.boolean()]).parse(args);
			ctx.state.running = running;
		}
	},
	snapshot: (state) => ({ running: state.running, starved: state.starved })
});
