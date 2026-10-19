/**
 * Glue between the flight loop and the audio engine (plan 053, ADR 0062): turns the HUD model (10 Hz)
 * and the sim's events into engine targets and one-shots. `frame` is called every render frame and
 * returns at once except every `PERIOD_MS`, so its main-thread cost stays far under a millisecond.
 *
 * Plan 227 (ADR 0210): the cue table's one-shots. The director counts every cue it plays (a test reads
 * the counts), keeps at most `EXPLOSION_MAX` explosions sounding, hears a touchdown in the radar
 * altitude, steps for a walking suit, a puff when RCS starts and a hiss when a jetpack lights.
 */
import type { AtmosphereLike, FlightSound } from './params';
import { SILENCE, flightSound, pressureRatio, warningDue } from './params';
import type { AudioEngine, OneShot } from './engine';
import { EXPLOSION_MAX, EXPLOSION_MS, type CueId } from './cues';

/** What the director reads of the HUD model. */
export interface AudioFlightView {
	throttle: number;
	/** An engine of the vessel is burning now. */
	engineOn: boolean;
	altitude: number;
	speed: number;
	heat: number;
	atmosphere: AtmosphereLike | undefined;
	/** RCS firing 0..1 (plan 211). */
	rcs?: number;
	/** Height of the lowest point above the ground, m (radar); null without terrain or far up. */
	radar?: number | null;
	/** A suit walking (plan 225). */
	walking?: boolean;
	/** A suit's jetpack firing 0..1 (plan 225). */
	jetpack?: number;
}

export const PERIOD_MS = 50;
/** Radar heights for a touchdown: from above `TOUCH_FROM` to at most `TOUCH_AT`, m, descending at least `TOUCH_MIN_SPEED` m/s. */
export const TOUCH_FROM = 1;
export const TOUCH_AT = 0.4;
export const TOUCH_MIN_SPEED = 0.5;
/** A touchdown at this speed or more plays at full intensity, m/s. */
export const TOUCH_HARD = 8;
/** Time between suit steps while walking, ms. */
export const STEP_MS = 450;

export interface Director {
	/** Call every frame; `view` is null before the first snapshot. */
	frame(now: number, view: AudioFlightView | null, warp: number, paused: boolean): void;
	event(kind: OneShot): void;
	/** Play a cue of the table (plan 227); `intensity` 0..1. Returns false when it was dropped. */
	cue(id: CueId, intensity?: number, now?: number): boolean;
	/** Silence the continuous sounds (leaving the page). */
	stop(): void;
	/** Time spent in `frame` since creation, ms, and the number of calls (the cost measurement). */
	readonly cost: { ms: number; calls: number };
	/** Cues played since creation, by id (plan 227: the e2e reads them). */
	readonly played: Readonly<Partial<Record<CueId, number>>>;
}

export interface DirectorOptions {
	/** A cue was played: the page shows its visual sign where nothing else does (the touchdown). */
	onCue?: (id: CueId, detail: { speed?: number }) => void;
	/** The counts changed (the page mirrors them for tests, `data-audio-cues`). */
	publish?: (played: Readonly<Partial<Record<CueId, number>>>) => void;
}

export function createDirector(engine: AudioEngine, options: DirectorOptions = {}): Director {
	let last = Number.NEGATIVE_INFINITY;
	let lastBeep = Number.NEGATIVE_INFINITY;
	let lastStep = Number.NEGATIVE_INFINITY;
	let lastTouch = Number.NEGATIVE_INFINITY;
	let radar: { h: number; t: number } | null = null;
	let armed = false;
	let rcsWas = 0;
	let jetWas = 0;
	const explosions: number[] = [];
	const cost = { ms: 0, calls: 0 };
	const played: Partial<Record<CueId, number>> = {};

	function cue(id: CueId, intensity = 1, now = performance.now()): boolean {
		if (id === 'explosion') {
			while (explosions.length > 0 && now - explosions[0]! >= EXPLOSION_MS) explosions.shift();
			if (explosions.length >= EXPLOSION_MAX) return false;
			explosions.push(now);
		}
		played[id] = (played[id] ?? 0) + 1;
		engine.oneShot(id, intensity);
		options.publish?.(played);
		return true;
	}

	/**
	 * A touchdown in the radar: armed while above `TOUCH_FROM`, heard when the height reaches
	 * `TOUCH_AT` still descending at `TOUCH_MIN_SPEED` or more.
	 */
	function touchdown(now: number, h: number | null | undefined): void {
		if (h === null || h === undefined || !Number.isFinite(h)) {
			radar = null;
			armed = false;
			return;
		}
		if (h > TOUCH_FROM) armed = true;
		if (radar && h !== radar.h) {
			const dt = (now - radar.t) / 1000;
			const speed = dt > 0 ? (radar.h - h) / dt : 0;
			if (armed && h <= TOUCH_AT && speed >= TOUCH_MIN_SPEED && now - lastTouch > 1000) {
				armed = false;
				lastTouch = now;
				cue('touchdown', Math.min(1, speed / TOUCH_HARD), now);
				options.onCue?.('touchdown', { speed });
			}
		}
		if (!radar || h !== radar.h) radar = { h, t: now };
	}

	return {
		cost,
		played,
		cue,
		frame(now, view, warp, paused) {
			const t0 = performance.now();
			cost.calls++;
			if (now - last >= PERIOD_MS) {
				last = now;
				let sound: FlightSound = SILENCE;
				if (view) {
					sound = flightSound({
						throttle: view.throttle,
						engineOn: view.engineOn,
						pressure: pressureRatio(view.altitude, view.atmosphere),
						speed: view.speed,
						warp,
						paused,
						rcs: Math.max(view.rcs ?? 0, view.jetpack ?? 0)
					});
					if (!paused && warningDue(view.heat, lastBeep, now)) {
						lastBeep = now;
						engine.oneShot('warning');
					}
					if (!paused && warp <= 1) {
						touchdown(now, view.radar);
						const rcs = view.rcs ?? 0;
						if (rcs > 0 && rcsWas === 0) cue('rcs', 1, now);
						rcsWas = rcs;
						const jet = view.jetpack ?? 0;
						if (jet > 0 && jetWas === 0) cue('jetpack', 1, now);
						jetWas = jet;
						if (view.walking && now - lastStep >= STEP_MS) {
							lastStep = now;
							cue('eva-step', 1, now);
						}
					}
				}
				engine.setFlight(sound);
			}
			cost.ms += performance.now() - t0;
		},
		event: (kind) => engine.oneShot(kind),
		stop: () => engine.setFlight(SILENCE)
	};
}
