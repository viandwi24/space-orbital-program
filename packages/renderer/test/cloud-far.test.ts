/** The far cloud shell (plan 403): it takes over where the march fades out, and reads the weather's map. */
import { describe, expect, test } from 'bun:test';
import {
	CLOUD_FAR,
	CLOUD_FAR_GATE,
	cloudFarAlpha,
	cloudFarSun,
	cloudWeights,
	farBlend,
	farGate
} from '../src/cloud-far.ts';
import { planetFragment } from '../src/shaders/planet.glsl.ts';
import { weatherCover } from '../src/weather.ts';

describe('the far cloud shell', () => {
	test('the march and the shell split the weather mask and sum to it at every distance', () => {
		for (const d of [0, 10_000, 45_000, 60_000, 80_000, 120_000, 900_000]) {
			const w = cloudWeights(d, 0.8);
			expect(w.march + w.shell).toBeCloseTo(0.8, 12);
		}
		expect(cloudWeights(10_000, 1)).toEqual({ march: 1, shell: 0 });
		expect(cloudWeights(500_000, 1)).toEqual({ march: 0, shell: 1 });
		expect(farBlend(CLOUD_FAR.from)).toBe(0);
		expect(farBlend(CLOUD_FAR.to)).toBe(1);
	});

	test('the shell has no cloud under the coverage threshold and the most opacity at full coverage', () => {
		expect(cloudFarAlpha(0, 1, 1)).toBe(0);
		expect(cloudFarAlpha(CLOUD_FAR.coverFrom, 1, 1)).toBe(0);
		expect(cloudFarAlpha(1, 1, 1)).toBeCloseTo(CLOUD_FAR.opacity, 12);
		let last = -1;
		for (let c = 0; c <= 1; c += 0.05) {
			const a = cloudFarAlpha(c, 1, 1);
			expect(a).toBeGreaterThanOrEqual(last);
			last = a;
		}
		// no shell inside the march's reach, and none when the weather is clear
		expect(cloudFarAlpha(1, 1, 0)).toBe(0);
		expect(cloudFarAlpha(1, 0, 1)).toBe(0);
	});

	test('the weather shows from orbit: a clear day and an overcast day give different shells', () => {
		const clear = weatherCover(1, 0);
		let low = Infinity;
		let high = -Infinity;
		for (let t = 0; t < 3 * 86_400; t += 3_600) {
			const c = weatherCover(1, t);
			low = Math.min(low, c);
			high = Math.max(high, c);
		}
		expect(high).toBeGreaterThan(low + 0.1);
		const mask = (c: number) => Math.min(1, Math.max(0, c * 2));
		expect(cloudFarAlpha(0.7, mask(high), 1)).toBeGreaterThan(
			cloudFarAlpha(0.7, mask(low), 1) - 1e-12
		);
		expect(clear).toBeGreaterThan(0);
	});

	test('the sun term is darker on the night side and never zero', () => {
		expect(cloudFarSun(-1)).toBe(CLOUD_FAR.sunBase);
		expect(cloudFarSun(1)).toBe(1);
		expect(cloudFarSun(0.2)).toBeGreaterThan(cloudFarSun(-0.2));
	});

	test('the GLSL pass carries the same shell', () => {
		expect(planetFragment).toContain('cloudFarAlpha');
		expect(planetFragment).toContain('cloudFarSun');
	});
});

describe('the far cloud shell relevance gate (plan 403)', () => {
	test('is off near the ground, ramps up with altitude and is on in orbit', () => {
		expect(farGate(0)).toBe(0);
		expect(farGate(CLOUD_FAR_GATE.from)).toBe(0);
		expect(farGate(CLOUD_FAR_GATE.to)).toBe(1);
		expect(farGate(900_000)).toBe(1);
		const mid = farGate((CLOUD_FAR_GATE.from + CLOUD_FAR_GATE.to) / 2);
		expect(mid).toBeGreaterThan(0);
		expect(mid).toBeLessThan(1);
	});
	test('the gate sits above the slab, so the near march alone draws below it', () => {
		expect(CLOUD_FAR_GATE.from).toBeGreaterThanOrEqual(10_000);
	});
});
