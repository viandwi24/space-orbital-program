import { describe, expect, it } from 'vitest';
import {
	HEAT_WARNING,
	RUMBLE_MAX,
	WARNING_PERIOD_MS,
	WIND_MIN_SPEED,
	busGains,
	flightSound,
	pressureRatio,
	warningDue,
	type FlightSoundInput
} from './params';

const home = { scaleHeight: 7_500, surfacePressure: 101_325, height: 70_000 };
const base: FlightSoundInput = {
	throttle: 1,
	engineOn: true,
	pressure: 1,
	speed: 0,
	warp: 1,
	paused: false
};
const sound = (patch: Partial<FlightSoundInput>) => flightSound({ ...base, ...patch });

describe('pressureRatio', () => {
	it('is 1 at the surface, falls with height, and is 0 in vacuum or without an atmosphere', () => {
		expect(pressureRatio(0, home)).toBe(1);
		expect(pressureRatio(7_500, home)).toBeCloseTo(Math.exp(-1), 9);
		expect(pressureRatio(10_000, home)).toBeGreaterThan(pressureRatio(20_000, home));
		expect(pressureRatio(70_000, home)).toBe(0);
		expect(pressureRatio(200_000, home)).toBe(0);
		expect(pressureRatio(0, undefined)).toBe(0);
		expect(pressureRatio(-5, home)).toBe(1);
	});
	it('never returns NaN', () => {
		expect(pressureRatio(Number.NaN, home)).toBe(0);
		expect(pressureRatio(1, { scaleHeight: 0, surfacePressure: 1, height: 10 })).toBe(0);
	});
});

describe('engine sound', () => {
	it('is silent at zero throttle or with no engine burning', () => {
		expect(sound({ throttle: 0 }).roarGain).toBe(0);
		expect(sound({ throttle: 0 }).rumbleGain).toBe(0);
		expect(sound({ engineOn: false }).roarGain).toBe(0);
		expect(sound({ engineOn: false }).rumbleGain).toBe(0);
	});
	it('rises with throttle', () => {
		let prev = -1;
		for (let t = 0; t <= 1.0001; t += 0.1) {
			const s = sound({ throttle: t });
			expect(s.roarGain).toBeGreaterThanOrEqual(prev);
			prev = s.roarGain;
		}
		expect(sound({ throttle: 1 }).roarGain).toBe(1);
		expect(sound({ throttle: 1 }).roarCutoff).toBeGreaterThan(sound({ throttle: 0.2 }).roarCutoff);
	});
	it('fades with falling pressure and is gone in vacuum', () => {
		const levels = [1, 0.5, 0.1, 0.01, 0].map((pressure) => sound({ pressure }).roarGain);
		for (let i = 1; i < levels.length; i++) expect(levels[i]!).toBeLessThanOrEqual(levels[i - 1]!);
		expect(levels.at(-1)).toBe(0);
	});
	it('keeps a muffled rumble in vacuum, at most a third of the sea-level roar', () => {
		const vacuum = sound({ pressure: 0 });
		expect(vacuum.roarGain).toBe(0);
		expect(vacuum.rumbleGain).toBeGreaterThan(0);
		expect(vacuum.rumbleGain).toBeLessThanOrEqual(sound({ pressure: 1 }).roarGain / 3);
		expect(RUMBLE_MAX).toBeLessThanOrEqual(1 / 3);
		expect(vacuum.rumbleFreq).toBeGreaterThan(sound({ throttle: 0.1, pressure: 0 }).rumbleFreq);
	});
	it('goes quiet above time warp 1 and while paused', () => {
		for (const patch of [{ warp: 2 }, { warp: 100_000 }, { paused: true }, { warp: Number.NaN }]) {
			const s = sound({ ...patch, speed: 300 });
			expect(s.roarGain).toBe(0);
			expect(s.rumbleGain).toBe(0);
			expect(s.windGain).toBe(0);
		}
	});
});

describe('wind', () => {
	it('is 0 at or below the threshold speed and in vacuum', () => {
		expect(sound({ speed: 0 }).windGain).toBe(0);
		expect(sound({ speed: WIND_MIN_SPEED }).windGain).toBe(0);
		expect(sound({ speed: 500, pressure: 0 }).windGain).toBe(0);
	});
	it('is monotonic in speed and in density', () => {
		let prev = 0;
		for (const speed of [40, 80, 160, 320, 640]) {
			const g = sound({ speed }).windGain;
			expect(g).toBeGreaterThan(prev);
			prev = g;
		}
		prev = 0;
		for (const pressure of [0.02, 0.1, 0.3, 1]) {
			const g = sound({ speed: 300, pressure }).windGain;
			expect(g).toBeGreaterThan(prev);
			prev = g;
		}
		expect(sound({ speed: 1e9 }).windGain).toBeLessThanOrEqual(0.6);
	});
});

describe('every output is finite and clamped', () => {
	it('for NaN, negative and huge input', () => {
		const bad = [Number.NaN, -5, 1e12, Infinity, -Infinity];
		for (const throttle of bad)
			for (const pressure of bad)
				for (const speed of bad) {
					const s = flightSound({
						throttle,
						engineOn: true,
						pressure,
						speed,
						warp: 1,
						paused: false
					});
					for (const [key, value] of Object.entries(s)) {
						expect(Number.isFinite(value), `${key} for ${throttle},${pressure},${speed}`).toBe(
							true
						);
						expect(value).toBeGreaterThanOrEqual(0);
					}
					expect(s.roarGain).toBeLessThanOrEqual(1);
					expect(s.rumbleGain).toBeLessThanOrEqual(RUMBLE_MAX);
					expect(s.windGain).toBeLessThanOrEqual(0.6);
					expect(s.roarCutoff).toBeLessThanOrEqual(20_000);
					expect(s.windCutoff).toBeLessThanOrEqual(20_000);
				}
	});
});

describe('warning tone', () => {
	it('is due when hot and the last beep is old enough, never for NaN heat', () => {
		expect(warningDue(HEAT_WARNING, -Infinity, 0)).toBe(true);
		expect(warningDue(0.5, -Infinity, 0)).toBe(false);
		expect(warningDue(1, 1000, 1000 + WARNING_PERIOD_MS - 1)).toBe(false);
		expect(warningDue(1, 1000, 1000 + WARNING_PERIOD_MS)).toBe(true);
		expect(warningDue(Number.NaN, -Infinity, 0)).toBe(false);
	});
});

describe('volumes', () => {
	it('clamp to 0..1, and mute zeroes the master only', () => {
		expect(busGains({ master: 2, effects: -1, ui: 0.5, muted: false })).toEqual({
			master: 1,
			effects: 0,
			ui: 0.5
		});
		expect(busGains({ master: 0.7, effects: 0.8, ui: 0.6, muted: true })).toEqual({
			master: 0,
			effects: 0.8,
			ui: 0.6
		});
		expect(busGains({ master: Number.NaN, effects: 1, ui: 1, muted: false }).master).toBe(0);
	});
});
