/**
 * What the player hears, as numbers (plan 053, ADR 0062). Pure: flight state in, gains and filter
 * frequencies out; `engine.ts` applies them to the Web Audio graph. Every output is finite and
 * clamped, whatever the input (a NaN from a bad snapshot must not reach an `AudioParam`).
 */

/** Reference sea-level density the wind proxy is scaled to; only the ratio matters. */
const clamp = (x: number, lo: number, hi: number): number =>
	Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo;
const unit = (x: number): number => clamp(x, 0, 1);
/** 0 at `a`, 1 at `b`, smooth in between. */
const smooth = (a: number, b: number, x: number): number => {
	const t = unit((x - a) / (b - a));
	return t * t * (3 - 2 * t);
};

export interface AtmosphereLike {
	scaleHeight: number;
	surfacePressure: number;
	height: number;
}

/**
 * Ambient pressure as a fraction of the surface's, 0 to 1: exponential in altitude, 0 above the
 * atmosphere's top and below a hundredth of a percent (where nothing carries sound).
 */
export function pressureRatio(altitude: number, atmosphere: AtmosphereLike | undefined): number {
	if (!atmosphere || !(atmosphere.surfacePressure > 0) || !(atmosphere.scaleHeight > 0)) return 0;
	if (!Number.isFinite(altitude) || altitude >= atmosphere.height) return 0;
	const ratio = Math.exp(-Math.max(0, altitude) / atmosphere.scaleHeight);
	return ratio < 1e-4 ? 0 : unit(ratio);
}

export interface FlightSoundInput {
	/** Vessel throttle, 0..1, counted only while an engine is actually burning. */
	throttle: number;
	engineOn: boolean;
	/** `pressureRatio` of the vessel's altitude. */
	pressure: number;
	/** Speed through the air (or the displayed speed), m/s. */
	speed: number;
	/** Time warp factor; above 1 the engine and wind go quiet. */
	warp: number;
	/** The sim is frozen (pause menu). */
	paused: boolean;
	/** RCS firing, 0..1 of all its nozzles at full thrust (plan 211); absent is none. */
	rcs?: number;
}

export interface FlightSound {
	/** Broadband engine roar: carried by the air, silent in vacuum. */
	roarGain: number;
	roarCutoff: number;
	/** Low rumble through the structure: stays in vacuum, at most a third of the sea-level roar. */
	rumbleGain: number;
	rumbleFreq: number;
	windGain: number;
	windCutoff: number;
	/** The RCS hiss (plan 211): high-passed noise by the thrusters' firing, heard in vacuum too. */
	hissGain: number;
}

export const SILENCE: FlightSound = {
	roarGain: 0,
	roarCutoff: 250,
	rumbleGain: 0,
	rumbleFreq: 38,
	windGain: 0,
	windCutoff: 400,
	hissGain: 0
};

/** Peak rumble level against a full-throttle sea-level roar of 1. */
export const RUMBLE_MAX = 0.12;
/** The RCS hiss with every nozzle at full fire (plan 211). */
export const HISS_MAX = 0.18;
/** Below this speed through the air there is no wind to hear, m/s. */
export const WIND_MIN_SPEED = 30;

export function flightSound(input: FlightSoundInput): FlightSound {
	if (input.paused || !(input.warp <= 1)) return { ...SILENCE };
	const thr = input.engineOn ? unit(input.throttle) : 0;
	const air = Math.sqrt(unit(input.pressure));
	// Wind follows density times the speed beyond the threshold: a dynamic-pressure proxy.
	const drive = unit(input.pressure) * Math.max(0, clamp(input.speed, 0, 1e6) - WIND_MIN_SPEED);
	return {
		roarGain: thr * air,
		roarCutoff: 250 + 2600 * thr * (0.35 + 0.65 * air),
		rumbleGain: thr * RUMBLE_MAX,
		rumbleFreq: 38 + 32 * thr,
		windGain: 0.6 * smooth(0, 700, drive),
		windCutoff: 400 + 3000 * smooth(0, 900, drive),
		// a short, soft hiss: plan 227 sets the final level
		hissGain: HISS_MAX * Math.sqrt(unit(input.rcs ?? 0))
	};
}

/** Hottest part as a fraction of its limit above which the warning tone repeats. */
export const HEAT_WARNING = 0.8;
export const WARNING_PERIOD_MS = 1500;

/** Whether a warning beep is due now: the part is hot and the last beep is old enough. */
export function warningDue(heat: number, lastBeepMs: number, nowMs: number): boolean {
	return Number.isFinite(heat) && heat >= HEAT_WARNING && nowMs - lastBeepMs >= WARNING_PERIOD_MS;
}

export interface Volumes {
	master: number;
	effects: number;
	ui: number;
	/** The ambient music bus (plan 227): quiet by default (0.25). Older callers may leave it out. */
	music?: number;
	muted: boolean;
}

/** The music bus's level when the settings give none (plan 227, rancangan §15 #9). */
export const DEFAULT_MUSIC = 0.25;

/** The gains the graph needs: a muted master is 0, every volume is clamped to 0..1. */
export function busGains(v: Volumes): {
	master: number;
	effects: number;
	ui: number;
	music: number;
} {
	return {
		master: v.muted ? 0 : unit(v.master),
		effects: unit(v.effects),
		ui: unit(v.ui),
		music: unit(v.music ?? DEFAULT_MUSIC)
	};
}
