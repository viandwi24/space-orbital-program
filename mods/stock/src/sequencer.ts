/**
 * The sequencer (plan 282, ADR 0348): a controller part that plays keyframe tracks over the robotic
 * joints of its vessel. A track names a joint by its part's design index and gives keyframes
 * `{ t, value }` (seconds, degrees or metres); the sequencer sets the joint's target along them, and
 * the joint moves at its own speed as before, so this adds no physics. `once` plays to the end and
 * stops, `loop` starts again, `pingpong` plays back and forth. The tracks are the module's `tracks`
 * config, set per part in the design's settings, so they are saved with the design.
 */
import { defineModule, z, type ActionCall } from '@orbital/sdk';

export const SEQUENCER_MODES = ['once', 'loop', 'pingpong'] as const;
export type SequencerMode = (typeof SEQUENCER_MODES)[number];

export const MAX_TRACKS = 8;
export const MAX_KEYS = 32;

const keySchema = z.object({
	t: z.number().min(0).max(3600),
	value: z.number().min(-3600).max(3600)
});

export const trackSchema = z.object({
	/** The joint's part, by design index. */
	part: z.number().int().min(0),
	/** The action that takes the value; a rotor has none (`setRunning` takes a boolean). */
	action: z.string().min(1).default('setTarget'),
	keys: z.array(keySchema).min(1).max(MAX_KEYS)
});
export type SequencerTrack = z.output<typeof trackSchema>;

export const sequencerConfigSchema = z.object({
	tracks: z.array(trackSchema).max(MAX_TRACKS).default([]),
	mode: z.enum(SEQUENCER_MODES).default('once')
});
export type SequencerConfig = z.output<typeof sequencerConfigSchema>;

export interface SequencerState {
	playing: boolean;
	/** Seconds into the sequence. */
	time: number;
	/** 1 forward, -1 back (pingpong). */
	direction: 1 | -1;
	/** The clock ran this step, so the tracks' values go out (also the step it ended on). */
	emit: boolean;
}

/** The length of a sequence: the last keyframe of any track, s. */
export const durationOf = (tracks: readonly SequencerTrack[]): number =>
	tracks.reduce((d, tr) => Math.max(d, ...tr.keys.map((k) => k.t)), 0);

/** A track's value at `t`: linear between keyframes (in time order), held before the first and after the last. */
export function valueAt(keys: readonly { t: number; value: number }[], t: number): number {
	const sorted = [...keys].sort((a, b) => a.t - b.t);
	const first = sorted[0]!;
	if (t <= first.t) return first.value;
	for (let i = 1; i < sorted.length; i++) {
		const b = sorted[i]!;
		if (t <= b.t) {
			const a = sorted[i - 1]!;
			return b.t === a.t ? b.value : a.value + ((b.value - a.value) * (t - a.t)) / (b.t - a.t);
		}
	}
	return sorted[sorted.length - 1]!.value;
}

/** One step of the clock: the new time, direction and whether it is still playing. */
export function advance(
	state: Omit<SequencerState, 'emit'>,
	mode: SequencerMode,
	duration: number,
	dt: number
): Omit<SequencerState, 'emit'> {
	if (!state.playing || duration <= 0) return state;
	let time = state.time + state.direction * dt;
	let direction = state.direction;
	let playing = true;
	if (mode === 'loop') {
		time = ((time % duration) + duration) % duration;
	} else if (mode === 'pingpong') {
		if (time >= duration) {
			time = duration - (time - duration);
			direction = -1;
		} else if (time <= 0) {
			time = -time;
			direction = 1;
		}
		time = Math.min(duration, Math.max(0, time));
	} else if (time >= duration) {
		time = duration;
		playing = false;
	}
	return { playing, time, direction };
}

export const ModuleSequencer = defineModule({
	id: 'stock.sequencer',
	config: sequencerConfigSchema,
	state: (): SequencerState => ({ playing: false, time: 0, direction: 1, emit: false }),
	describe: (config, state) => ({
		category: 'stock.robotics',
		actions: [
			{
				id: 'setPlaying',
				label: 'Play sequence',
				kind: 'toggle',
				value: state.playing,
				enabled: config.tracks.length > 0,
				group: 'stock.sequence',
				icon: 'wheel'
			},
			{
				id: 'rewind',
				label: 'Rewind',
				kind: 'trigger',
				enabled: true,
				icon: 'wheel'
			}
		]
	}),
	update: (ctx, dt) => {
		const was = ctx.state.playing;
		const next = advance(ctx.state, ctx.config.mode, durationOf(ctx.config.tracks), dt);
		ctx.state.playing = next.playing;
		ctx.state.time = next.time;
		ctx.state.direction = next.direction;
		ctx.state.emit = was;
	},
	drive: (ctx): ActionCall[] => {
		const { config, state } = ctx;
		// the targets follow the clock while it runs (and on the step it ends), then the joints are free
		if (!state.emit) return [];
		return config.tracks.map((tr) => ({
			part: tr.part,
			module: 'stock.robotic',
			action: tr.action,
			args: [valueAt(tr.keys, state.time)]
		}));
	},
	actions: {
		setPlaying: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			if (on && ctx.state.time >= durationOf(ctx.config.tracks) && ctx.config.mode === 'once') {
				ctx.state.time = 0;
				ctx.state.direction = 1;
			}
			ctx.state.playing = on;
		},
		rewind: (ctx) => {
			ctx.state.time = 0;
			ctx.state.direction = 1;
			ctx.state.playing = false;
		}
	},
	snapshot: (state) => ({
		playing: state.playing,
		time: state.time,
		direction: state.direction
	})
});
