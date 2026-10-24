/**
 * Editing a sequencer's keyframe tracks in the Hangar (plan 282, ADR 0348): the tracks are the
 * `tracks` and `mode` settings of the part's `stock.sequencer` module in the design. Pure functions
 * on the tracks; each edit through the controller is one undo step.
 */
import type { PartLookup, VesselDesign } from '@orbital/core';
import {
	MAX_KEYS,
	MAX_TRACKS,
	SEQUENCER_MODES,
	durationOf,
	sequencerConfigSchema,
	type RoboticConfig,
	type SequencerConfig,
	type SequencerMode,
	type SequencerTrack
} from '@orbital/mod-stock';
import { setPartSettings, type Content, type EditorState } from './state';

export const SEQUENCER_MODULE = 'stock.sequencer';
export { MAX_KEYS, MAX_TRACKS, SEQUENCER_MODES, durationOf };
export type { SequencerMode, SequencerTrack };

/** A joint a track may drive: a robotic part of the design that moves to a value. */
export interface JointChoice {
	index: number;
	title: string;
	kind: RoboticConfig['kind'];
	/** The travel in degrees or metres. */
	min: number;
	max: number;
	unit: '°' | 'm';
}

/** The sequencer's tracks and mode on part `index` (the defaults when it has no settings). */
export function sequencerOf(
	design: Pick<VesselDesign, 'parts'>,
	parts: PartLookup,
	index: number
): SequencerConfig | null {
	const entry = design.parts.find((p) => p.index === index);
	const def = entry && parts.get(entry.part);
	const base = def?.modules?.find(([id]) => id === SEQUENCER_MODULE);
	if (!entry || !base) return null;
	const merged = { ...(base[1] as object), ...entry.settings?.[SEQUENCER_MODULE] };
	const parsed = sequencerConfigSchema.safeParse(merged);
	return parsed.success ? parsed.data : { tracks: [], mode: 'once' };
}

/** The joints of the design a track can drive, in design order (rotors have no target). */
export function jointsOf(design: Pick<VesselDesign, 'parts'>, parts: PartLookup): JointChoice[] {
	const out: JointChoice[] = [];
	for (const p of design.parts) {
		const def = parts.get(p.part);
		const mod = def?.modules?.find(([id]) => id === 'stock.robotic');
		if (!def || !mod) continue;
		const cfg = { ...(mod[1] as RoboticConfig), ...p.settings?.['stock.robotic'] } as RoboticConfig;
		if (cfg.kind === 'rotor') continue;
		out.push({
			index: p.index,
			title: def.title,
			kind: cfg.kind,
			min: cfg.min ?? -90,
			max: cfg.max ?? 90,
			unit: cfg.kind === 'piston' ? 'm' : '°'
		});
	}
	return out;
}

const round = (v: number, step = 0.01): number => Math.round(v / step) * step;

/** A new track on `joint`, starting at the middle of its travel at 0 s and 2 s. */
export function newTrack(joint: JointChoice): SequencerTrack {
	const mid = round((joint.min + joint.max) / 2);
	return {
		part: joint.index,
		action: 'setTarget',
		keys: [
			{ t: 0, value: mid },
			{ t: 2, value: joint.max }
		]
	};
}

const replace = <T>(list: readonly T[], i: number, item: T): T[] =>
	list.map((x, k) => (k === i ? item : x));

export function addTrack(config: SequencerConfig, joint: JointChoice): SequencerConfig {
	if (config.tracks.length >= MAX_TRACKS) return config;
	return { ...config, tracks: [...config.tracks, newTrack(joint)] };
}

export const removeTrack = (config: SequencerConfig, i: number): SequencerConfig => ({
	...config,
	tracks: config.tracks.filter((_, k) => k !== i)
});

/** Adds a keyframe after the last one (1 s later, at the same value), up to the limit. */
export function addKey(config: SequencerConfig, i: number): SequencerConfig {
	const track = config.tracks[i];
	if (!track || track.keys.length >= MAX_KEYS) return config;
	const last = [...track.keys].sort((a, b) => a.t - b.t).at(-1)!;
	const keys = [...track.keys, { t: round(last.t + 1, 0.05), value: last.value }];
	return { ...config, tracks: replace(config.tracks, i, { ...track, keys }) };
}

/** Sets a keyframe's time or value; the time is held to 0 to an hour, the value to the joint's travel when given. */
export function setKey(
	config: SequencerConfig,
	i: number,
	k: number,
	change: { t?: number; value?: number },
	travel?: { min: number; max: number }
): SequencerConfig {
	const track = config.tracks[i];
	const key = track?.keys[k];
	if (!track || !key) return config;
	const t = change.t === undefined ? key.t : Math.min(3600, Math.max(0, change.t));
	let value = change.value === undefined ? key.value : change.value;
	if (travel) value = Math.min(travel.max, Math.max(travel.min, value));
	const keys = replace(track.keys, k, { t, value });
	return { ...config, tracks: replace(config.tracks, i, { ...track, keys }) };
}

/** Removes a keyframe; a track keeps at least one. */
export function removeKey(config: SequencerConfig, i: number, k: number): SequencerConfig {
	const track = config.tracks[i];
	if (!track || track.keys.length <= 1) return config;
	const keys = track.keys.filter((_, n) => n !== k);
	return { ...config, tracks: replace(config.tracks, i, { ...track, keys }) };
}

export const setMode = (config: SequencerConfig, mode: SequencerMode): SequencerConfig => ({
	...config,
	mode
});

/** Writes the tracks and mode into the part's settings: one undo step; throws when the design would not resolve. */
export function applySequencer(
	state: EditorState,
	content: Content,
	index: number,
	config: SequencerConfig
): EditorState {
	return setPartSettings(state, content, index, SEQUENCER_MODULE, {
		tracks: config.tracks,
		mode: config.mode
	});
}

/** Where a keyframe sits on a timeline of width 1 (0 to 1), for the strip that draws it. */
export const keyPosition = (t: number, duration: number): number =>
	duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 0;
