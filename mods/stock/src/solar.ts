/**
 * The stock solar panel (plan 190, ADR 0171; real sunlight since plan 208, ADR 0213): electric
 * charge at `rate` × the panel's angle factor × the sunlight's flux (inverse square of the distance
 * to the star, relative to the home planet; zero in a body's shadow). The same in flight (`update`)
 * and on rails (`background`, integrated over the interval along the path), up to what the
 * vessel's batteries hold.
 */
import { defineModule, z, type Vec3 } from '@orbital/sdk';
import { ElectricCharge } from './resources.ts';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const solarPanelConfigSchema = z.object({
	/** Electric charge per second facing the star at the home planet's distance. */
	rate: z.number().positive().default(0.5),
	deployed: z.boolean().default(false),
	/** A fixed panel cannot fold: it always works and has no toggle. */
	deployable: z.boolean().default(true),
	/**
	 * `flat`: a plate facing `normal` (part frame), output × cos of the angle to the star.
	 * `track`: the panel turns about the part's +Y axis toward the star, output × the sine of the
	 * star's angle to that axis.
	 */
	mode: z.enum(['flat', 'track']).default('flat'),
	normal: vec3.default([0, 0, 1])
});
export type SolarPanelConfig = z.output<typeof solarPanelConfigSchema>;
export interface SolarPanelState {
	deployed: boolean;
}

/** The share of `rate` the panel gives for the star in `direction` (part frame); 1 without a star. */
export function panelFactor(config: SolarPanelConfig, direction: Vec3 | null): number {
	if (!direction) return 1;
	if (config.mode === 'track') return Math.sqrt(Math.max(0, 1 - direction.y * direction.y));
	const [x, y, z] = config.normal;
	const n = Math.hypot(x, y, z) || 1;
	return Math.max(0, (x * direction.x + y * direction.y + z * direction.z) / n);
}

type SolarContext = {
	config: SolarPanelConfig;
	state: SolarPanelState;
	vessel: {
		sunExposure(dt: number, factor: (direction: Vec3 | null) => number): number;
		resources: { deposit(resource: string, amount: number): number };
	};
};

/** Charge for `dt` seconds; the batteries keep what fits. */
function charge(ctx: SolarContext, dt: number): void {
	if (dt <= 0 || (ctx.config.deployable && !ctx.state.deployed)) return;
	const exposure = ctx.vessel.sunExposure(dt, (d) => panelFactor(ctx.config, d));
	if (exposure > 0)
		ctx.vessel.resources.deposit(ElectricCharge.id, ctx.config.rate * exposure * dt);
}

export const ModuleSolarPanel = defineModule({
	id: 'stock.solar-panel',
	config: solarPanelConfigSchema,
	state: (config): SolarPanelState => ({ deployed: config.deployed || !config.deployable }),
	describe: (config, state) => ({
		category: 'other',
		actions: !config.deployable
			? []
			: [
					{
						id: 'setDeployed',
						label: 'Solar panel',
						kind: 'toggle',
						value: state.deployed,
						enabled: true,
						group: 'stock.solar',
						icon: 'solar'
					}
				]
	}),
	update: charge,
	background: charge,
	actions: {
		deploy: (ctx) => {
			ctx.state.deployed = true;
		},
		retract: (ctx) => {
			if (ctx.config.deployable) ctx.state.deployed = false;
		},
		/** `(deployed)` (the part action toggle, plan 110). */
		setDeployed: (ctx, ...args) => {
			const [deployed] = z.tuple([z.boolean()]).parse(args);
			if (ctx.config.deployable) ctx.state.deployed = deployed;
		}
	},
	snapshot: (state) => ({ deployed: state.deployed })
});

export const rtgConfigSchema = z.object({
	/** Electric charge per second, always (ADR 0203 point 3: 0.75, the KSP reference). */
	rate: z.number().positive().default(0.75)
});

/** A radioisotope generator (plan 208): a constant charge, in flight and on rails, needing no sun. */
function rtgCharge(
	ctx: {
		config: z.output<typeof rtgConfigSchema>;
		vessel: { resources: { deposit(resource: string, amount: number): number } };
	},
	dt: number
): void {
	if (dt > 0) ctx.vessel.resources.deposit(ElectricCharge.id, ctx.config.rate * dt);
}

export const ModuleRtg = defineModule({
	id: 'stock.rtg',
	config: rtgConfigSchema,
	describe: () => ({ category: 'other' }),
	update: rtgCharge,
	background: rtgCharge
});
