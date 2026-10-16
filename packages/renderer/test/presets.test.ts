import { ENVIRONMENT_PRESETS, findPreset } from '../src/camera-presets.ts';
import { describe, expect, test } from 'bun:test';
import { GRAPHICS_PRESETS, PRESETS, parsePreset, selectPreset } from '../src/presets.ts';
import { DAY_EXPOSURE, NIGHT_EXPOSURE, adaptExposure, exposureFor } from '../src/exposure.ts';

describe('presets', () => {
	test('selectPreset: software, phones, small textures and old Intel get low', () => {
		expect(selectPreset({ gpu: 'ANGLE (Google, Vulkan, SwiftShader)', maxTextureSize: 8192 })).toBe(
			'low'
		);
		expect(selectPreset({ gpu: 'Apple GPU', maxTextureSize: 16384, mobile: true })).toBe('low');
		expect(selectPreset({ gpu: 'NVIDIA GeForce RTX 3060', maxTextureSize: 4096 })).toBe('low');
		expect(selectPreset({ gpu: 'Intel(R) UHD Graphics 620', maxTextureSize: 16384 })).toBe('low');
		expect(selectPreset({ maxTextureSize: 16384, deviceMemoryGb: 2 })).toBe('low');
	});
	test('selectPreset: Apple silicon and discrete GPUs get high, unknown gets medium', () => {
		expect(
			selectPreset({
				gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)',
				maxTextureSize: 16384
			})
		).toBe('high');
		expect(
			selectPreset({
				gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
				maxTextureSize: 16384
			})
		).toBe('medium');
		expect(selectPreset({ gpu: 'NVIDIA GeForce RTX 3060', maxTextureSize: 32768 })).toBe('high');
		expect(selectPreset({ gpu: 'Intel(R) Iris(R) Xe Graphics', maxTextureSize: 16384 })).toBe(
			'medium'
		);
		expect(selectPreset({ maxTextureSize: 16384 })).toBe('medium');
	});
	test('parsePreset accepts the three names and rejects everything else', () => {
		for (const p of GRAPHICS_PRESETS) expect(parsePreset(p)).toBe(p);
		for (const bad of ['ultra', '', 'HIGH', null, undefined, 3, {}])
			expect(parsePreset(bad)).toBeNull();
	});
	test('the table is ordered low <= medium <= high on every quality knob', () => {
		const keys = [
			'pixelRatioCap',
			'msaa',
			'shadowMapSize',
			'bloomScale',
			'viewSamples',
			'lightSamples',
			'groundOctaves',
			'cloudOctaves',
			'mapWidth',
			'trees',
			'terrainSize',
			'terrainSteps',
			'terrainShadowSteps',
			'envSize'
		] as const;
		for (const k of keys) {
			expect(PRESETS.low[k]).toBeLessThanOrEqual(PRESETS.medium[k]);
			expect(PRESETS.medium[k]).toBeLessThanOrEqual(PRESETS.high[k]);
		}
		expect(PRESETS.low.post).toBe(false);
		expect(PRESETS.low.shadowMapSize).toBe(0);
		expect(PRESETS.medium.post && PRESETS.high.post).toBe(true);
	});
});

describe('exposure', () => {
	test('decreases monotonically with sun elevation between night and day values', () => {
		let last = Infinity;
		for (let e = -40; e <= 90; e += 2) {
			const x = exposureFor(e);
			expect(x).toBeLessThanOrEqual(last + 1e-12);
			last = x;
		}
		expect(exposureFor(-40)).toBe(NIGHT_EXPOSURE);
		expect(exposureFor(60)).toBeCloseTo(DAY_EXPOSURE, 9);
	});
	test('adaptation moves toward the target without overshoot and ignores dt = 0', () => {
		expect(adaptExposure(1, 5, 0)).toBe(1);
		const a = adaptExposure(1, 5, 0.5);
		expect(a).toBeGreaterThan(1);
		expect(a).toBeLessThan(5);
		expect(adaptExposure(1, 5, 1000)).toBeCloseTo(5, 6);
	});
});

describe('screenshot presets', () => {
	test('names are unique, rigs are sane and lookup works', () => {
		const names = ENVIRONMENT_PRESETS.map((p) => p.name);
		expect(new Set(names).size).toBe(names.length);
		for (const p of ENVIRONMENT_PRESETS) {
			expect(p.rig.distance).toBeGreaterThanOrEqual(2); // FLIGHT_RIG_LIMITS.minDistance
			expect(Math.abs(p.rig.pitch)).toBeLessThan(Math.PI / 2);
		}
		expect(findPreset('pad-noon')?.sun?.elevation).toBe(62);
		expect(findPreset('nope')).toBeUndefined();
	});
});
