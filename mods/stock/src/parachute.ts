/**
 * Parachutes (plan 209, ADR 0203 point 4), the KSP model since 1.2. Staging (or Deploy) arms the
 * chute. An armed chute semi-deploys once the static pressure reaches its minimum and fully deploys
 * below its full-deploy height above the ground. "Deploy when safe" (the default) waits while the
 * airflow is Unsafe (a canopy opened in it tears); Risky air opens it, with the warning shown.
 * "Immediately" and Force deploy open it at once, and a canopy open in Unsafe air tears. The canopy's drag `½ ρ CdA |v| v` acts at the chute's top, so the vessel hangs below it.
 *
 * The safety class the panel shows is the one this module tears by: `safety` in the state is
 * refreshed every flight step from the airflow at the part.
 */
import { defineModule, SEA_LEVEL_PRESSURE, z, type EntityId, type Vec3 } from '@orbital/sdk';

declare module '@orbital/sdk' {
	interface EventMap {
		/** A canopy opened: `semi` (streaming) or `full`. */
		'stock:parachute-deployed': { part: EntityId; stage: 'semi' | 'full' };
		/** A canopy was torn off by the airflow. */
		'stock:parachute-torn': { part: EntityId; speed: number };
	}
}

export const PARACHUTE_STATES = ['stowed', 'armed', 'semi', 'full', 'cut', 'torn'] as const;
export type ParachuteStatus = (typeof PARACHUTE_STATES)[number];
export const PARACHUTE_SAFETY = ['safe', 'risky', 'unsafe'] as const;
export type ParachuteSafety = (typeof PARACHUTE_SAFETY)[number];
export type ParachuteMode = 'when-safe' | 'immediate';

/** The tweakable ranges (ADR 0203 point 4): minimum pressure in atm, full-deploy height in m. */
export const MIN_PRESSURE_RANGE = { min: 0.01, max: 0.5, step: 0.01 } as const;
export const DEPLOY_HEIGHT_RANGE = { min: 50, max: 5_000, step: 50 } as const;

export const parachuteConfigSchema = z.object({
	/** Static pressure at which an armed chute semi-deploys, atm. */
	minPressure: z.number().min(MIN_PRESSURE_RANGE.min).max(MIN_PRESSURE_RANGE.max).default(0.04),
	/** Height above the ground at which a semi-deployed chute opens fully, m. */
	deployHeight: z.number().min(DEPLOY_HEIGHT_RANGE.min).max(DEPLOY_HEIGHT_RANGE.max).default(1_000),
	/** Drag coefficient times area, semi-deployed (a streaming canopy), m². */
	semiDragArea: z.number().positive(),
	/** Drag coefficient times area, fully deployed, m². */
	fullDragArea: z.number().positive(),
	/** Seconds the canopy takes to semi-deploy, then to open from semi to full. */
	semiSeconds: z.number().positive().default(1),
	fullSeconds: z.number().positive().default(3),
	/** Airspeed from which the airflow is Risky, then Unsafe (a canopy opened in it tears), m/s. */
	riskySpeed: z.number().positive().default(250),
	unsafeSpeed: z.number().positive().default(330),
	/** Dynamic pressure from which the airflow is Risky, then Unsafe, Pa. */
	riskyQ: z.number().positive().default(20_000),
	unsafeQ: z.number().positive().default(40_000),
	/** Where the shroud lines meet the part, part frame, m (the drag acts there). */
	anchor: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
	mode: z.enum(['when-safe', 'immediate']).default('when-safe')
});
export type ParachuteConfig = z.output<typeof parachuteConfigSchema>;

export interface ParachuteState {
	status: ParachuteStatus;
	mode: ParachuteMode;
	/** atm, m: the player's settings (start at the config's). */
	minPressure: number;
	deployHeight: number;
	/** 0..1 of the opening towards the current stage (semi or full). */
	opening: number;
	safety: ParachuteSafety;
}

/** The airflow class a canopy feels at `speed` (m/s) in air of `density` (kg/m³). */
export function parachuteSafety(
	config: Pick<ParachuteConfig, 'riskySpeed' | 'unsafeSpeed' | 'riskyQ' | 'unsafeQ'>,
	speed: number,
	density: number
): ParachuteSafety {
	const q = 0.5 * density * speed * speed;
	if (speed >= config.unsafeSpeed || q >= config.unsafeQ) return 'unsafe';
	if (speed >= config.riskySpeed || q >= config.riskyQ) return 'risky';
	return 'safe';
}

/** Drag coefficient times area of the canopy now, m² (0 when not open). */
export function parachuteDragArea(config: ParachuteConfig, state: ParachuteState): number {
	if (state.status === 'semi') return config.semiDragArea * state.opening;
	if (state.status === 'full')
		return config.semiDragArea + (config.fullDragArea - config.semiDragArea) * state.opening;
	return 0;
}

/** How open the canopy looks, 0..1 (the renderer's deploy flag): a semi canopy is a narrow streamer. */
export const SEMI_CANOPY = 0.3;
export function canopyOpening(state: Pick<ParachuteState, 'status' | 'opening'>): number {
	if (state.status === 'semi') return SEMI_CANOPY * state.opening;
	if (state.status === 'full') return SEMI_CANOPY + (1 - SEMI_CANOPY) * state.opening;
	return 0;
}

export const PARACHUTE_STATUS_TEXT: Record<ParachuteStatus, string> = {
	stowed: 'Stowed',
	armed: 'Armed',
	semi: 'Semi-deployed',
	full: 'Deployed',
	cut: 'Cut',
	torn: 'Torn'
};
export const PARACHUTE_SAFETY_TEXT: Record<ParachuteSafety, string> = {
	safe: 'Safe',
	risky: 'Risky',
	unsafe: 'Unsafe'
};

const open = (s: ParachuteStatus): boolean => s === 'semi' || s === 'full';

export const ModuleParachute = defineModule({
	id: 'stock.parachute',
	config: parachuteConfigSchema,
	state: (config): ParachuteState => ({
		status: 'stowed',
		mode: config.mode,
		minPressure: config.minPressure,
		deployHeight: config.deployHeight,
		opening: 0,
		safety: 'safe'
	}),
	describe: (_config, state) => {
		const s = state.status;
		const done = s === 'cut' || s === 'torn';
		return {
			category: 'landing',
			readouts: [
				{ id: 'status', label: 'Parachute', value: PARACHUTE_STATUS_TEXT[s] },
				{ id: 'safety', label: 'Airflow', value: PARACHUTE_SAFETY_TEXT[state.safety] }
			],
			actions: [
				{
					id: 'deploy',
					label: 'Deploy',
					kind: 'trigger',
					enabled: s === 'stowed',
					...(s === 'stowed' ? {} : { reason: `The parachute is ${PARACHUTE_STATUS_TEXT[s]}` }),
					group: 'stock.parachutes',
					icon: 'parachute'
				},
				{
					id: 'forceDeploy',
					label: 'Force deploy',
					kind: 'trigger',
					enabled: s === 'stowed' || s === 'armed',
					...(s === 'stowed' || s === 'armed'
						? {}
						: { reason: `The parachute is ${PARACHUTE_STATUS_TEXT[s]}` })
				},
				{
					id: 'disarm',
					label: 'Disarm',
					kind: 'trigger',
					enabled: s === 'armed',
					...(s === 'armed' ? {} : { reason: 'Only an armed parachute can be disarmed' })
				},
				{
					id: 'cut',
					label: 'Cut',
					kind: 'trigger',
					enabled: open(s),
					...(open(s) ? {} : { reason: 'Only an open canopy can be cut' })
				},
				{
					id: 'setMode',
					label: 'Deploy',
					kind: 'mode',
					value: state.mode,
					options: [
						{ value: 'when-safe', label: 'When safe' },
						{ value: 'immediate', label: 'Immediately' }
					],
					enabled: !done
				},
				{
					id: 'setMinPressure',
					label: 'Min pressure',
					kind: 'value',
					value: state.minPressure,
					...MIN_PRESSURE_RANGE,
					unit: 'atm',
					enabled: !done && !open(s)
				},
				{
					id: 'setDeployHeight',
					label: 'Full deploy at',
					kind: 'value',
					value: state.deployHeight,
					...DEPLOY_HEIGHT_RANGE,
					unit: 'm',
					enabled: !done && s !== 'full'
				}
			]
		};
	},
	// Staging arms the chute (KSP since 1.2): it opens by itself when the air allows.
	onStage(ctx) {
		if (ctx.state.status === 'stowed') ctx.state.status = 'armed';
	},
	update(ctx, dt) {
		const { config, state } = ctx;
		const ambient = ctx.vessel.ambient;
		const point: Vec3 = { x: config.anchor[0], y: config.anchor[1], z: config.anchor[2] };
		const air = ctx.vessel.airVelocity(point);
		const speed = Math.hypot(air.x, air.y, air.z);
		state.safety = parachuteSafety(config, speed, ambient.density);
		const tear = (): void => {
			state.status = 'torn';
			state.opening = 0;
			ctx.events.emit('stock:parachute-torn', { part: ctx.entity, speed });
		};
		const begin = (stage: 'semi' | 'full'): void => {
			state.status = stage;
			state.opening = 0;
			ctx.events.emit('stock:parachute-deployed', { part: ctx.entity, stage });
		};
		if (state.status === 'armed') {
			const thick = ambient.pressure >= state.minPressure * SEA_LEVEL_PRESSURE;
			// "when safe" waits only for air that would tear the canopy: in Risky air it opens (a capsule's
			// terminal speed high up is about 260 m/s, so waiting for Safe could mean never)
			const allowed = state.mode === 'immediate' || state.safety !== 'unsafe';
			if (thick && allowed) begin('semi');
		}
		if (state.status === 'semi' && state.opening >= 1) {
			const low = (ambient.height ?? ambient.altitude) <= state.deployHeight;
			if (low && (state.mode === 'immediate' || state.safety !== 'unsafe')) begin('full');
		}
		if (!open(state.status)) return;
		if (state.safety === 'unsafe') return tear();
		const seconds = state.status === 'semi' ? config.semiSeconds : config.fullSeconds;
		state.opening = Math.min(1, state.opening + dt / seconds);
		const k = 0.5 * ambient.density * parachuteDragArea(config, state) * speed;
		if (k > 0) ctx.vessel.applyForce({ x: -k * air.x, y: -k * air.y, z: -k * air.z }, point);
	},
	actions: {
		deploy: (ctx) => {
			if (ctx.state.status === 'stowed') ctx.state.status = 'armed';
		},
		/** Opens the canopy now, whatever the pressure and the airflow (it tears in Unsafe air). */
		forceDeploy: (ctx) => {
			const s = ctx.state;
			if (s.status !== 'stowed' && s.status !== 'armed') return;
			s.mode = 'immediate';
			s.status = 'armed';
			s.minPressure = MIN_PRESSURE_RANGE.min;
		},
		disarm: (ctx) => {
			if (ctx.state.status === 'armed') ctx.state.status = 'stowed';
		},
		cut: (ctx) => {
			if (open(ctx.state.status)) {
				ctx.state.status = 'cut';
				ctx.state.opening = 0;
			}
		},
		setMode: (ctx, ...args) => {
			const [mode] = z.tuple([z.enum(['when-safe', 'immediate'])]).parse(args);
			ctx.state.mode = mode;
		},
		setMinPressure: (ctx, ...args) => {
			const [atm] = z
				.tuple([z.number().min(MIN_PRESSURE_RANGE.min).max(MIN_PRESSURE_RANGE.max)])
				.parse(args);
			ctx.state.minPressure = atm;
		},
		setDeployHeight: (ctx, ...args) => {
			const [m] = z
				.tuple([z.number().min(DEPLOY_HEIGHT_RANGE.min).max(DEPLOY_HEIGHT_RANGE.max)])
				.parse(args);
			ctx.state.deployHeight = m;
		}
	},
	snapshot: (state) => ({
		status: state.status,
		mode: state.mode,
		minPressure: state.minPressure,
		deployHeight: state.deployHeight,
		opening: state.opening,
		safety: state.safety,
		canopy: canopyOpening(state),
		open: open(state.status)
	})
});
