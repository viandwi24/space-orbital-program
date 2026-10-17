/**
 * Glue between the flight loop and the audio engine (plan 053, ADR 0062): turns the HUD model (10 Hz)
 * and the sim's events into engine targets and one-shots. `frame` is called every render frame and
 * returns at once except every `PERIOD_MS`, so its main-thread cost stays far under a millisecond.
 */
import type { AtmosphereLike, FlightSound } from './params';
import { SILENCE, flightSound, pressureRatio, warningDue } from './params';
import type { AudioEngine, OneShot } from './engine';

/** What the director reads of the HUD model. */
export interface AudioFlightView {
	throttle: number;
	/** An engine of the vessel is burning now. */
	engineOn: boolean;
	altitude: number;
	speed: number;
	heat: number;
	atmosphere: AtmosphereLike | undefined;
}

export const PERIOD_MS = 50;

export interface Director {
	/** Call every frame; `view` is null before the first snapshot. */
	frame(now: number, view: AudioFlightView | null, warp: number, paused: boolean): void;
	event(kind: OneShot): void;
	/** Silence the continuous sounds (leaving the page). */
	stop(): void;
	/** Time spent in `frame` since creation, ms, and the number of calls (the cost measurement). */
	readonly cost: { ms: number; calls: number };
}

export function createDirector(engine: AudioEngine): Director {
	let last = Number.NEGATIVE_INFINITY;
	let lastBeep = Number.NEGATIVE_INFINITY;
	const cost = { ms: 0, calls: 0 };
	return {
		cost,
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
						paused
					});
					if (!paused && warningDue(view.heat, lastBeep, now)) {
						lastBeep = now;
						engine.oneShot('warning');
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
