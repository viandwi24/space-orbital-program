/**
 * Tethers (plan 313, ADR 0272): a winch whose rope ties on to a socket of another vessel, and the
 * socket; and a strut that can be released in flight. The sim owns the rope: it ties an armed winch
 * on, pulls while the rope is taut, snaps it above its strength and writes `connected`, `length`,
 * `tension` and `snapped` here. The winch reels by changing `length`, drawing electric charge.
 */
import { defineModule, z } from '@orbital/sdk';
import { ElectricCharge } from './resources.ts';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const toVec = (v: readonly [number, number, number]) => ({ x: v[0], y: v[1], z: v[2] });

export const REEL_MODES = ['in', 'stop', 'out'] as const;
export type Reel = (typeof REEL_MODES)[number];

export const winchConfigSchema = z.object({
	/** Where the rope leaves the part, part frame, m. */
	anchor: vec3.default([0, 0, 0]),
	/** Rope on the drum, m. */
	maxLength: z.number().positive().default(40),
	/** Reeling speed, m/s. */
	speed: z.number().positive().default(1),
	/** The pull it holds before it snaps, N. */
	strength: z.number().positive().default(60_000),
	/** Electric charge while reeling, EC/s. */
	power: z.number().nonnegative().default(2)
});
export type WinchConfig = z.output<typeof winchConfigSchema>;

export interface WinchState {
	/** Armed: the sim ties the rope on to a socket in reach. */
	armed: boolean;
	reel: Reel;
	/** Kept by the sim (ADR 0272 amendment). */
	connected: boolean;
	length: number;
	tension: number;
	snapped: boolean;
	/** The last step had no charge to reel. */
	starved: boolean;
}

const MIN_LENGTH = 0.3;

/** A winch (plan 313): Connect arms it, Release lets go; it reels in and out while tied on. */
export const ModuleWinch = defineModule({
	id: 'stock.winch',
	config: winchConfigSchema,
	state: (): WinchState => ({
		armed: false,
		reel: 'stop',
		connected: false,
		length: 0,
		tension: 0,
		snapped: false,
		starved: false
	}),
	tether: (config, state) =>
		state.armed || state.connected
			? {
					anchor: toVec(config.anchor),
					maxLength: config.maxLength,
					length: state.connected ? state.length : config.maxLength,
					strength: config.strength,
					connect: state.armed && !state.snapped
				}
			: null,
	describe: (config, state) => ({
		category: 'stock.other',
		readouts: [
			{
				id: 'rope',
				label: 'Rope',
				value: state.connected
					? `${state.length.toFixed(1)} of ${config.maxLength} m`
					: state.snapped
						? 'Snapped'
						: state.armed
							? `Waiting for a socket within ${config.maxLength} m`
							: 'Stowed'
			},
			...(state.connected
				? [{ id: 'tension', label: 'Pull', value: `${(state.tension / 1000).toFixed(1)} kN` }]
				: [])
		],
		actions: [
			state.armed || state.connected
				? {
						id: 'release',
						label: 'Release the rope',
						kind: 'trigger' as const,
						enabled: true,
						group: 'stock.winch',
						icon: 'docking'
					}
				: {
						id: 'connect',
						label: 'Connect to a socket',
						kind: 'trigger' as const,
						enabled: true,
						group: 'stock.winch',
						icon: 'docking'
					},
			{
				id: 'setReel',
				label: 'Reel',
				kind: 'mode' as const,
				value: state.reel,
				options: [
					{ value: 'in', label: 'In' },
					{ value: 'stop', label: 'Hold' },
					{ value: 'out', label: 'Out' }
				],
				enabled: state.connected,
				...(state.connected ? {} : { reason: 'no rope tied on' }),
				icon: 'docking'
			}
		]
	}),
	update: (ctx, dt) => {
		const { config, state } = ctx;
		state.starved = false;
		// a snapped rope stops the drum, so tying on again does not reel straight on
		if (state.snapped) state.reel = 'stop';
		if (!state.connected || state.reel === 'stop' || dt <= 0) return;
		const want = config.power * dt;
		const got = want > 0 ? ctx.vessel.resources.withdraw(ElectricCharge.id, want) : 0;
		const share = want > 0 ? got / want : 1;
		if (share < 1e-6) {
			state.starved = true;
			return;
		}
		const step = config.speed * dt * share * (state.reel === 'in' ? -1 : 1);
		state.length = Math.min(config.maxLength, Math.max(MIN_LENGTH, state.length + step));
	},
	actions: {
		connect: (ctx) => {
			ctx.state.armed = true;
			ctx.state.snapped = false;
		},
		release: (ctx) => {
			ctx.state.armed = false;
			ctx.state.reel = 'stop';
		},
		/** `('in' | 'stop' | 'out')`. */
		setReel: (ctx, ...args) => {
			const [reel] = z.tuple([z.enum(REEL_MODES)]).parse(args);
			ctx.state.reel = reel;
		},
		reelIn: (ctx) => {
			ctx.state.reel = 'in';
		},
		reelOut: (ctx) => {
			ctx.state.reel = 'out';
		},
		stop: (ctx) => {
			ctx.state.reel = 'stop';
		}
	},
	snapshot: (state) => ({
		armed: state.armed,
		reel: state.reel,
		connected: state.connected,
		length: state.length,
		tension: state.tension,
		snapped: state.snapped,
		starved: state.starved
	})
});

export const socketConfigSchema = z.object({
	/** Where a rope ties on, part frame, m. */
	anchor: vec3.default([0, 0, 0])
});

/** A tether socket (plan 313): a winch of another vessel ties its rope on here. */
export const ModuleTetherSocket = defineModule({
	id: 'stock.tether-socket',
	config: socketConfigSchema,
	socket: (config) => ({ anchor: toVec(config.anchor) }),
	describe: () => ({ category: 'stock.other' })
});

export const strutConfigSchema = z.object({
	/** Staging releases it (KSP: a strut may be set to let go on a stage). */
	stageRelease: z.boolean().default(false)
});
export interface StrutState {
	released: boolean;
}

/** A strut that lets go of its far end (plan 313): Release, or its stage. */
export const ModuleStrut = defineModule({
	id: 'stock.strut',
	config: strutConfigSchema,
	state: (): StrutState => ({ released: false }),
	describe: (config, state) => ({
		category: 'structural',
		actions: [
			{
				id: 'release',
				label: state.released ? 'Released' : 'Release',
				kind: 'trigger',
				enabled: !state.released,
				...(state.released ? { reason: 'already released' } : {}),
				group: 'stock.strut',
				icon: 'decouple'
			},
			{
				id: 'setStageRelease',
				label: 'Release on stage',
				kind: 'toggle',
				value: config.stageRelease,
				enabled: true,
				buildOnly: true,
				build: 'stageRelease'
			}
		]
	}),
	onStage(ctx) {
		if (!ctx.config.stageRelease || ctx.state.released) return;
		ctx.state.released = true;
		ctx.vessel.releaseLink?.();
	},
	actions: {
		release: (ctx) => {
			if (ctx.state.released) return;
			ctx.state.released = true;
			ctx.vessel.releaseLink?.();
		},
		// a build setting only (the Hangar writes `stageRelease`)
		setStageRelease: () => {}
	},
	snapshot: (state) => ({ released: state.released })
});
