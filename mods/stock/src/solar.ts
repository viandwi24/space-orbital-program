/**
 * The stock solar panel (plan 190, ADR 0171; real sunlight since plan 208, ADR 0214): electric
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
	normal: vec3.default([0, 0, 1]),
	/** Staging unfolds the panel (plan 302: a panel may sit in the staging stack, as in KSP). */
	stageable: z.boolean().default(false),
	/**
	 * Dynamic pressure above which the deployed panel breaks, Pa (plan 280): it folds, gives nothing
	 * and cannot be deployed again. Folded, it never breaks. Absent: it does not break.
	 */
	breakQ: z.number().positive().optional()
});
export type SolarPanelConfig = z.output<typeof solarPanelConfigSchema>;
export interface SolarPanelState {
	deployed: boolean;
	/** The share of `rate` it gives now, 0..1 (plan 240); 0 in shadow or folded. */
	exposure?: number;
	/** Torn off by the airflow (plan 280). */
	broken?: boolean;
}

/** Dynamic pressure on a part, Pa: half the air density times the airspeed squared. */
export function dynamicPressure(vessel: {
	ambient: { density: number };
	airVelocity(): Vec3;
}): number {
	const rho = vessel.ambient.density;
	if (!(rho > 0)) return 0;
	const v = vessel.airVelocity();
	return 0.5 * rho * (v.x * v.x + v.y * v.y + v.z * v.z);
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
	if (dt <= 0) return;
	if ((ctx.config.deployable && !ctx.state.deployed) || ctx.state.broken) {
		ctx.state.exposure = 0;
		return;
	}
	const exposure = ctx.vessel.sunExposure(dt, (d) => panelFactor(ctx.config, d));
	ctx.state.exposure = exposure;
	if (exposure > 0)
		ctx.vessel.resources.deposit(ElectricCharge.id, ctx.config.rate * exposure * dt);
}

export const ModuleSolarPanel = defineModule({
	id: 'stock.solar-panel',
	config: solarPanelConfigSchema,
	state: (config): SolarPanelState => ({ deployed: config.deployed || !config.deployable }),
	describe: (config, state) => ({
		category: 'stock.other',
		// what it gives now (plan 240); a panel not yet stepped reads as its rating
		readouts: [
			{
				id: 'output',
				label: 'Output',
				value: state.broken
					? 'Broken by the airflow: 0 EC/s'
					: config.deployable && !state.deployed
						? 'Folded: 0 EC/s'
						: state.exposure === undefined
							? `up to ${config.rate} EC/s`
							: state.exposure > 0
								? `${(config.rate * state.exposure).toFixed(2)} EC/s · sunlight ${Math.round(
										state.exposure * 100
									)} %`
								: '0 EC/s · in shadow or facing away'
			}
		],
		actions: !config.deployable
			? []
			: [
					{
						id: 'setDeployed',
						label: 'Solar panel',
						kind: 'toggle',
						value: state.deployed,
						enabled: !state.broken,
						...(state.broken ? { reason: 'Broken by the airflow' } : {}),
						group: 'stock.solar',
						icon: 'solar',
						// the Hangar sets whether it starts open (plan 316)
						build: 'deployed'
					}
				]
	}),
	// by day at its rating (facing the star at the home planet's distance)
	power: (config) => ({ rate: config.rate, sun: true }),
	update(ctx, dt) {
		// a deployed panel in air too strong for it breaks (plan 280); folded, it is safe
		const { breakQ } = ctx.config;
		if (breakQ !== undefined && ctx.state.deployed && !ctx.state.broken) {
			if (dynamicPressure(ctx.vessel) > breakQ) {
				ctx.state.broken = true;
				ctx.state.deployed = false;
			}
		}
		charge(ctx, dt);
	},
	background: charge,
	onStage(ctx) {
		if (ctx.config.stageable && ctx.config.deployable && !ctx.state.broken)
			ctx.state.deployed = true;
	},
	actions: {
		deploy: (ctx) => {
			if (!ctx.state.broken) ctx.state.deployed = true;
		},
		retract: (ctx) => {
			if (ctx.config.deployable) ctx.state.deployed = false;
		},
		/** `(deployed)` (the part action toggle, plan 110). */
		setDeployed: (ctx, ...args) => {
			const [deployed] = z.tuple([z.boolean()]).parse(args);
			if (ctx.config.deployable && !ctx.state.broken) ctx.state.deployed = deployed;
		}
	},
	snapshot: (state) => ({
		deployed: state.deployed,
		...(state.broken ? { broken: true } : {}),
		...(state.exposure === undefined ? {} : { exposure: state.exposure })
	})
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
	describe: (config) => ({
		category: 'stock.other',
		readouts: [{ id: 'output', label: 'Output', value: `${config.rate} EC/s, always` }]
	}),
	power: (config) => ({ rate: config.rate }),
	update: rtgCharge,
	background: rtgCharge
});
