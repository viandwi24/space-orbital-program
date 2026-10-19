/**
 * The sound cue table (plan 227, ADR 0210): every one-shot the game plays, the bus it plays on, its
 * peak gain and the visual sign that shows the same event without sound (rancangan §11.8). Data, so a
 * test can hold every cue to a sign and a gain under the bus limit. The music beds by page.
 */

export type CueId =
	| 'explosion'
	| 'decouple'
	| 'chute-semi'
	| 'chute-full'
	| 'touchdown'
	| 'rcs'
	| 'eva-step'
	| 'jetpack'
	| 'docking'
	| 'map-open'
	| 'map-close'
	| 'warp-up'
	| 'warp-down';

export interface Cue {
	bus: 'effects' | 'ui';
	/** Peak gain of the one-shot before its bus, 0..`BUS_LIMIT`. */
	gain: number;
	/** What shows the event on screen (nothing may depend on hearing). */
	visual: string;
}

/** No cue may peak above this before its bus (the compressor on the master catches the rest). */
export const BUS_LIMIT = 1;
/** Explosions at once: more within `EXPLOSION_MS` are dropped, so a breakup does not clip. */
export const EXPLOSION_MAX = 4;
export const EXPLOSION_MS = 1600;

export const CUES: Readonly<Record<CueId, Cue>> = {
	explosion: { bus: 'effects', gain: 0.9, visual: 'the "part destroyed" toast and the debris' },
	decouple: { bus: 'effects', gain: 0.7, visual: 'the stage toast and the staging stack' },
	'chute-semi': {
		bus: 'effects',
		gain: 0.5,
		visual: 'the chute toast and its Semi-deployed status'
	},
	'chute-full': { bus: 'effects', gain: 0.7, visual: 'the chute toast and its Deployed status' },
	touchdown: { bus: 'effects', gain: 0.8, visual: 'the touchdown toast with its speed' },
	rcs: { bus: 'effects', gain: 0.3, visual: 'the RCS chip and the thruster puffs' },
	'eva-step': { bus: 'effects', gain: 0.25, visual: 'the suit walking (crew panel: walking)' },
	jetpack: { bus: 'effects', gain: 0.35, visual: 'the suit status: Jetpack on' },
	docking: { bus: 'effects', gain: 0.8, visual: 'the docked toast' },
	'map-open': { bus: 'ui', gain: 0.3, visual: 'the map view itself' },
	'map-close': { bus: 'ui', gain: 0.3, visual: 'the flight view itself' },
	'warp-up': { bus: 'ui', gain: 0.3, visual: 'the warp level in the time capsule' },
	'warp-down': { bus: 'ui', gain: 0.3, visual: 'the warp level in the time capsule' }
};

export const CUE_IDS = Object.keys(CUES) as CueId[];

/** The ambient music beds (plan 227): one per kind of page; null is silence. */
export type MusicBed = 'menu' | 'space-center' | 'hangar' | 'space';

/** A bed: a slow chord of detuned oscillators under a lowpass, in Hz. */
export interface BedSpec {
	notes: readonly number[];
	cutoff: number;
	/** Breathing of the lowpass, Hz. */
	lfo: number;
}

export const BEDS: Readonly<Record<MusicBed, BedSpec>> = {
	// A2 E3 B3 C#4: open, waiting
	menu: { notes: [110, 164.81, 246.94, 277.18], cutoff: 900, lfo: 0.05 },
	// D3 A3 E4 F#4: daylight on the pad
	'space-center': { notes: [146.83, 220, 329.63, 369.99], cutoff: 1200, lfo: 0.07 },
	// G2 D3 A3 B3: the workshop, low and steady
	hangar: { notes: [98, 146.83, 220, 246.94], cutoff: 700, lfo: 0.04 },
	// C2 G2 D3 E3: wide and dark
	space: { notes: [65.41, 98, 146.83, 164.81], cutoff: 500, lfo: 0.03 }
};

/** Crossfade between beds, s. */
export const MUSIC_FADE = 2.5;
/** Music level while a warning sounds, as a fraction, and how long the duck lasts, s. */
export const DUCK_LEVEL = 0.35;
export const DUCK_SECONDS = 1.5;

/** The bed for a page path: the menu, the Space Center, the Hangar, a flight; else none. */
export function musicForPath(path: string): MusicBed | null {
	const p = path.replace(/\/+$/, '') || '/';
	if (p === '/' || p.endsWith('/worlds') || p.endsWith('/settings')) return 'menu';
	if (p.endsWith('/space-center') || p.endsWith('/mission-center')) return 'space-center';
	if (p.endsWith('/vab') || p.endsWith('/launch')) return 'hangar';
	if (p.endsWith('/flight')) return 'space';
	return null;
}
