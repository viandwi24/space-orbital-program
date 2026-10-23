import { describe, expect, it } from 'vitest';
import {
	batteryFrameCap,
	frameCapFps,
	governorCeiling,
	isSafari,
	learnedKey,
	lockCeiling,
	parseAutoQuality,
	parseFrameCap,
	parseLearnedLevel,
	resolvePreset,
	startPreset,
	warmPresetsFor
} from './graphics';

describe('resolvePreset', () => {
	it('prefers a saved preset over the device default', () => {
		expect(resolvePreset('high', { gpu: 'Apple M2', maxTextureSize: 16384 })).toBe('high');
	});
	it('falls back to the device default', () => {
		expect(
			resolvePreset(null, {
				gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5)',
				maxTextureSize: 16384
			})
		).toBe('high');
		expect(resolvePreset(null, { gpu: 'Google SwiftShader', maxTextureSize: 8192 })).toBe('low');
	});
});

describe('parseAutoQuality', () => {
	it('is on unless the stored value is exactly off', () => {
		expect(parseAutoQuality(null)).toBe(true);
		expect(parseAutoQuality('on')).toBe(true);
		expect(parseAutoQuality('garbage')).toBe(true);
		expect(parseAutoQuality('off')).toBe(false);
	});
});

describe('Automatic by measured headroom (plan 362, ADR 0304)', () => {
	const m5 = { gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5)', maxTextureSize: 16384 };
	it('reads the learned level of one backend and rejects bad values', () => {
		const stored = JSON.stringify({ webgpu: { preset: 'medium', scale: 0.85 } });
		expect(parseLearnedLevel(stored, 'webgpu')).toEqual({ preset: 'medium', scale: 0.85 });
		expect(parseLearnedLevel(stored, 'webgl')).toBeNull();
		expect(parseLearnedLevel('{"webgpu":{"preset":"ultra","scale":1}}', 'webgpu')).toBeNull();
		expect(parseLearnedLevel('{"webgpu":{"preset":"low","scale":3}}', 'webgpu')).toBeNull();
		expect(parseLearnedLevel('not json', 'webgpu')).toBeNull();
		expect(parseLearnedLevel(null, 'webgpu')).toBeNull();
	});
	it('starts at the player preset, else the learned one, else the device default', () => {
		expect(startPreset('low', { preset: 'medium', scale: 1 }, m5)).toBe('low');
		expect(startPreset(null, { preset: 'medium', scale: 1 }, m5)).toBe('medium');
		expect(startPreset(null, null, m5)).toBe('high');
	});
	it('the ceiling is the top preset only for Automatic while adjusting', () => {
		expect(governorCeiling(null, true, 'medium')).toBe('high');
		expect(governorCeiling(null, false, 'medium')).toBe('medium');
		expect(governorCeiling('low', true, 'low')).toBe('low');
	});
	it('the frame-rate limit defaults to the display rate', () => {
		expect(parseFrameCap(null)).toBe('display');
		expect(parseFrameCap('60')).toBe('60');
		expect(parseFrameCap('120')).toBe('120');
expect(frameCapFps('120')).toBe(120);
expect(parseFrameCap('144')).toBe('display');
		expect(frameCapFps('display')).toBeNull();
		expect(frameCapFps('30')).toBe(30);
	});
	it('warms every preset the governor can reach up to the ceiling, nearest first, none when it may not adjust', () => {
		expect(warmPresetsFor('high', true, 'high')).toEqual(['medium', 'low']);
		expect(warmPresetsFor('medium', true, 'high')).toEqual(['low', 'high']);
		expect(warmPresetsFor('medium', true, 'medium')).toEqual(['low']);
		expect(warmPresetsFor('low', true, 'high')).toEqual(['medium', 'high']);
		expect(warmPresetsFor('low', true, 'low')).toEqual([]);
		expect(warmPresetsFor('medium', false, 'high')).toEqual([]);
	});
});

describe('the 120 Hz lock target (plan 395, ADR 0338)', () => {
	const m5 = { gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5)', maxTextureSize: 16384 };
	const chrome =
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
	const safari =
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
	it('stores and applies 120 in the frame-rate setting', () => {
		expect(parseFrameCap('120')).toBe('120');
		expect(frameCapFps('120')).toBe(120);
	});
	it('aims at 120 on the M5 in Chrome and at 60 in Safari, on an M2 and on mid-range Windows', () => {
		expect(isSafari(safari)).toBe(true);
		expect(isSafari(chrome)).toBe(false);
		expect(lockCeiling(m5, chrome)).toBe(120);
		expect(lockCeiling(m5, safari)).toBe(60);
		for (const gpu of ['Apple M2', 'Intel(R) Iris(R) Xe Graphics', 'NVIDIA GeForce GTX 1650'])
			expect(lockCeiling({ gpu, maxTextureSize: 16384 }, chrome)).toBe(60);
	});
	it('limits to 60 on battery only when the player chose nothing', () => {
		expect(batteryFrameCap(false, false)).toBe(60);
		expect(batteryFrameCap(false, true)).toBeNull();
		expect(batteryFrameCap(false, null)).toBeNull();
		expect(batteryFrameCap(true, false)).toBeNull();
	});
	it('keeps the learned level per lock target and reads its TAAU rung', () => {
		expect(learnedKey('webgpu', 120)).toBe('webgpu@120');
		expect(learnedKey('webgpu', 60)).toBe('webgpu');
		const stored = JSON.stringify({ 'webgpu@120': { preset: 'high', scale: 1, taau: 0.6 } });
		expect(parseLearnedLevel(stored, 'webgpu@120')).toEqual({ preset: 'high', scale: 1, taau: 0.6 });
		expect(parseLearnedLevel(stored, 'webgpu')).toBeNull();
	});
});
