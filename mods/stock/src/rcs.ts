/**
 * Reaction control (plan 211, ADR 0217): a set of nozzles that fire in proportion to the rotation
 * and translation they can give, while the vessel's RCS is on. Each nozzle's share is
 * `clamp(dir · translate + mix(rotation, lever × dir), 0, 1) × limiter`, the KSP behaviour without
 * an optimiser: deterministic and per nozzle. Propellant flows like an engine's, at
 * `thrust / (Isp × g0)` with the Isp between its sea-level and vacuum values by the ambient
 * pressure. SAS sees the torque the nozzles can give (`controlAuthority`) while RCS is on.
 */
import { defineModule, SEA_LEVEL_PRESSURE, STANDARD_GRAVITY, z, type Vec3 } from '@orbital/sdk';
import { propellantRates } from './engine.ts';
import { cross, mixFraction } from './steering.ts';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const rcsConfigSchema = z
	.object({
		/** Nozzles: where each sits (part frame, m) and the direction it pushes the vessel (unit). */
		nozzles: z
			.array(z.object({ pos: vec3, dir: vec3 }))
			.min(1)
			.max(16),
		/** Thrust of one nozzle at full fire, N. */
		thrust: z.number().positive(),
		ispVacuum: z.number().positive(),
		ispSeaLevel: z.number().positive(),
		/** The resource the nozzles burn (monopropellant or cold gas); `propellants` takes its place for a mix. */
		propellant: z.string().min(1).optional(),
		/**
		 * A mix the nozzles burn (plan 299: liquid fuel and oxidizer): `ratio` is by volume, as an
		 * engine's. When it is absent `propellant` is the one resource.
		 */
		propellants: z
			.array(z.object({ resource: z.string().min(1), ratio: z.number().positive() }))
			.min(1)
			.optional(),
		/** Where the part starts (plan 241: the Hangar's build settings write these). */
		limiter: z.number().min(0).max(1).default(1),
		rotate: z.boolean().default(true),
		translate: z.boolean().default(true),
		/** The vessel axes the part answers (plan 299; a switch off on every block gives none of that motion). */
		pitch: z.boolean().default(true),
		yaw: z.boolean().default(true),
		roll: z.boolean().default(true),
		/** Translation: sideways (`x`), forward and back (`y`), up and down (`z`). */
		sideways: z.boolean().default(true),
		forward: z.boolean().default(true),
		vertical: z.boolean().default(true)
	})
	.refine(
		(c) => c.propellant !== undefined || c.propellants !== undefined,
		'a propellant or a mix'
	);
export type RcsConfig = z.output<typeof rcsConfigSchema>;

export const AXIS_NAMES = ['pitch', 'yaw', 'roll', 'sideways', 'forward', 'vertical'] as const;
export type AxisName = (typeof AXIS_NAMES)[number];
const AXIS_LABEL: Record<AxisName, string> = {
	pitch: 'Pitch',
	yaw: 'Yaw',
	roll: 'Roll',
	sideways: 'Translate sideways',
	forward: 'Translate forward and back',
	vertical: 'Translate up and down'
};

/** What the part burns: the mix, or its one resource. */
export const rcsPropellants = (
	config: Pick<RcsConfig, 'propellant' | 'propellants'>
): Array<{ resource: string; ratio: number }> =>
	config.propellants ?? [{ resource: config.propellant!, ratio: 1 }];

/** 1 for an axis the part answers, 0 for one switched off. */
const on = (state: Pick<RcsState, 'axes'>, axis: AxisName): number =>
	state.axes?.[axis] === false ? 0 : 1;
/** The rotation (`x` pitch, `y` roll, `z` yaw) and translation (`x` sideways, `y` forward, `z` up) masks. */
export const rotationMask = (state: Pick<RcsState, 'axes'>): Vec3 => ({
	x: on(state, 'pitch'),
	y: on(state, 'roll'),
	z: on(state, 'yaw')
});
export const translationMask = (state: Pick<RcsState, 'axes'>): Vec3 => ({
	x: on(state, 'sideways'),
	y: on(state, 'forward'),
	z: on(state, 'vertical')
});

export interface RcsState {
	/** 0..1 of the thrust (the per-part limiter). */
	limiter: number;
	/** The nozzles answer rotation demands. */
	rotate: boolean;
	/** The nozzles answer translation demands. */
	translate: boolean;
	/** The axes the part answers (plan 299); absent: all. */
	axes?: Partial<Record<AxisName, boolean>>;
	/** The nozzles fired last step: the fraction of each (for the puffs and the hiss). */
	firing: number[];
	/** The last step wanted thrust and got no propellant. */
	dry: boolean;
}

const unit = (v: readonly [number, number, number]): Vec3 => {
	const n = Math.hypot(v[0], v[1], v[2]) || 1;
	return { x: v[0] / n, y: v[1] / n, z: v[2] / n };
};
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** The fraction (0..1) each nozzle fires at for a torque `rotation` and a `translation` demand. */
export function nozzleFractions(
	config: RcsConfig,
	state: Pick<RcsState, 'limiter' | 'rotate' | 'translate'>,
	com: Vec3,
	rotation: Vec3,
	translation: Vec3
): number[] {
	return config.nozzles.map((n) => {
		const dir = unit(n.dir);
		const lever = { x: n.pos[0] - com.x, y: n.pos[1] - com.y, z: n.pos[2] - com.z };
		let share = 0;
		if (state.translate) share += dot(dir, translation);
		if (state.rotate) share += mixFraction(rotation, cross(lever, dir));
		return Math.min(1, Math.max(0, share)) * state.limiter;
	});
}

/** Isp at an ambient pressure, s: vacuum at 0, sea level at 1 atm, linear between, never below 0.1. */
export const rcsIsp = (config: RcsConfig, pressure: number): number =>
	Math.max(
		0.1,
		config.ispVacuum +
			(config.ispSeaLevel - config.ispVacuum) * Math.min(2, pressure / SEA_LEVEL_PRESSURE)
	);

export const ModuleRcs = defineModule({
	id: 'stock.rcs',
	config: rcsConfigSchema,
	state: (config): RcsState => ({
		limiter: config.limiter,
		rotate: config.rotate,
		translate: config.translate,
		axes: Object.fromEntries(AXIS_NAMES.map((a) => [a, config[a]])),
		firing: config.nozzles.map(() => 0),
		dry: false
	}),
	describe: (_config, state) => ({
		category: 'control',
		actions: [
			{
				id: 'setLimiter',
				label: 'RCS thrust limit',
				kind: 'value',
				value: state.limiter,
				min: 0,
				max: 1,
				step: 0.05,
				enabled: true,
				build: 'limiter'
			},
			{
				id: 'setRotate',
				label: 'RCS rotation',
				kind: 'toggle',
				value: state.rotate,
				enabled: true,
				group: 'stock.rcs',
				icon: 'rcs',
				build: 'rotate'
			},
			{
				id: 'setTranslate',
				label: 'RCS translation',
				kind: 'toggle',
				value: state.translate,
				enabled: true,
				build: 'translate'
			},
			// the axes the part answers (plan 299): off on every block, that motion is gone
			...AXIS_NAMES.map((axis) => ({
				id: `setAxis:${axis}`,
				label: AXIS_LABEL[axis],
				kind: 'toggle' as const,
				value: state.axes?.[axis] !== false,
				more: true,
				enabled: true,
				build: axis
			}))
		]
	}),
	controlAuthority: (ctx) => {
		if (!ctx.vessel.rcs || !ctx.state.rotate) return { x: 0, y: 0, z: 0 };
		const com = ctx.vessel.centreOfMass;
		const out = { x: 0, y: 0, z: 0 };
		const mask = rotationMask(ctx.state);
		for (const n of ctx.config.nozzles) {
			const lever = { x: n.pos[0] - com.x, y: n.pos[1] - com.y, z: n.pos[2] - com.z };
			const t = cross(lever, unit(n.dir));
			// a nozzle fires one way only: half its torque reach counts in each direction
			const f = (ctx.config.thrust * ctx.state.limiter) / 2;
			out.x += f * Math.abs(t.x);
			out.y += f * Math.abs(t.y);
			out.z += f * Math.abs(t.z);
		}
		// a switched-off axis gives the assist nothing (the part frame's axes, as the torque reach is)
		return { x: out.x * mask.x, y: out.y * mask.y, z: out.z * mask.z };
	},
	update: (ctx, dt) => {
		const s = ctx.state;
		const quiet = (): void => {
			s.firing = ctx.config.nozzles.map(() => 0);
		};
		if (!ctx.vessel.rcs || dt <= 0) return quiet();
		const fractions = nozzleFractions(
			ctx.config,
			s,
			ctx.vessel.centreOfMass,
			ctx.vessel.torqueDemandMasked?.(rotationMask(s)) ?? ctx.vessel.torqueDemand,
			ctx.vessel.translateDemandMasked?.(translationMask(s)) ?? ctx.vessel.translateDemand
		);
		const total = fractions.reduce((a, b) => a + b, 0);
		if (total <= 0) {
			s.dry = false;
			return quiet();
		}
		// propellant for this step at the ambient Isp, by the mix; short of any of it, every nozzle fires less
		const mix = rcsPropellants(ctx.config);
		const isp = rcsIsp(ctx.config, ctx.vessel.ambient.pressure);
		const mass = (ctx.config.thrust * total * dt) / (isp * STANDARD_GRAVITY);
		const need = propellantRates(
			{ propellants: mix },
			mass,
			(resource) => ctx.registries.resources.get(resource)?.density ?? 1
		);
		let scale = 1;
		for (const n of need)
			scale = Math.min(scale, n.rate > 0 ? ctx.vessel.resources.amount(n.resource) / n.rate : 1);
		scale = Math.max(0, scale);
		for (const n of need) if (scale > 0) ctx.vessel.resources.withdraw(n.resource, n.rate * scale);
		s.dry = scale < 1e-6;
		s.firing = fractions.map((f) => f * scale);
		ctx.config.nozzles.forEach((n, i) => {
			const f = ctx.config.thrust * s.firing[i]!;
			if (f <= 0) return;
			const d = unit(n.dir);
			ctx.vessel.applyForce(
				{ x: d.x * f, y: d.y * f, z: d.z * f },
				{
					x: n.pos[0],
					y: n.pos[1],
					z: n.pos[2]
				}
			);
		});
	},
	actions: {
		/** `(limiter)` 0..1 (the part action slider). */
		setLimiter: (ctx, ...args) => {
			const [v] = z.tuple([z.number().min(0).max(1)]).parse(args);
			ctx.state.limiter = v;
		},
		setRotate: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.rotate = on;
		},
		setTranslate: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.translate = on;
		},
		/** `setAxis:<axis>(on)` (keyed action id, ADR 0220 point 4). */
		setAxis: (ctx, ...args) => {
			const [axis, on] = z.tuple([z.enum(AXIS_NAMES), z.boolean()]).parse(args);
			(ctx.state.axes ??= {})[axis] = on;
		}
	},
	snapshot: (state) => ({
		limiter: state.limiter,
		rotate: state.rotate,
		translate: state.translate,
		...(state.axes && Object.values(state.axes).some((v) => v === false)
			? { axes: { ...state.axes } }
			: {}),
		firing: state.firing,
		dry: state.dry
	})
});
