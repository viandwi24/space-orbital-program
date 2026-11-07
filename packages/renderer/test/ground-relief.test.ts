import { describe, expect, test } from 'bun:test';
import { TERRAIN_SHAPE, TERRAIN_MAX_SLOPE } from '@orbital/core';
import { ROCK_SHADING } from '../src/detail-textures.ts';
import { PRESETS } from '../src/presets.ts';
import { planetFragment } from '../src/shaders/planet.glsl.ts';
import { terrainBakeFragment, terrainHeightGLSL } from '../src/shaders/terrain.glsl.ts';

/** Plan 417: the relief and the rock shading are the same text in the twins, from the same tables. */
describe('ground relief in the shaders', () => {
	const num = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));

	test('the bakes carry the ridge octaves, the cliff table and the band limit of the texel', () => {
		const s = TERRAIN_SHAPE;
		for (const n of [
			s.ridgeMean,
			s.ridgeFineLow,
			s.ridgeFineHigh,
			s.cliffWavelengthKm,
			s.cliffLow,
			s.cliffHigh,
			s.cliffSteps,
			s.cliffTreadLow,
			s.cliffTreadHigh,
			s.cliffStrength
		])
			expect(terrainBakeFragment).toContain(num(n));
		expect(terrainBakeFragment).toContain(`${s.ridgeOctaves}, 31, ${s.ridgeFineFrom}`);
		// the bakes know their texel; the exact function (a moon's ground pass) does not
		expect(terrainBakeFragment).toContain('#define TERRAIN_TEXEL_M (uTexel * uRadius)');
		expect(terrainHeightGLSL).toContain('#define TERRAIN_TEXEL_M 0.0');
		// the octave loops have room for every octave
		expect(Math.max(s.hillOctaves, s.ridgeOctaves)).toBeLessThanOrEqual(10);
		expect(terrainHeightGLSL).toContain('i < 10');
	});

	test('the slope bound covers the cliffs: a riser is at most the table says, over the plain ridge', () => {
		const s = TERRAIN_SHAPE;
		const riser = 1.5 / (s.cliffTreadHigh - s.cliffTreadLow);
		const gain = 1 + s.cliffStrength * (riser - 1);
		// the plain ground is at most 1 over the lowlands and a bit more on a crest; the bound has margin
		expect(gain).toBeGreaterThan(3);
		expect(gain * 1.1).toBeLessThanOrEqual(TERRAIN_MAX_SLOPE);
	});

	test('the planet pass has the rock strata, the tint and the detail normals, in the same numbers', () => {
		for (const { period, amp } of ROCK_SHADING.strata) {
			expect(planetFragment).toContain(num(period));
			expect(planetFragment).toContain(num(amp));
		}
		for (const { wavelengthM, salt } of ROCK_SHADING.macro)
			expect(planetFragment).toContain(`noiseA(pl, ${num(wavelengthM)}, ${salt})`);
		expect(planetFragment).toContain('rock detail normals (plan 417)');
		expect(planetFragment).toContain(num(ROCK_SHADING.bump));
		// still one detail texture
		expect(planetFragment.match(/uniform sampler2D uDetail;/g)?.length).toBe(1);
	});

	test('Low shades terrain shadows with three steps, no more than Medium', () => {
		expect(PRESETS.low.terrainShadowSteps).toBe(3);
		expect(PRESETS.low.terrainShadowSteps).toBeLessThanOrEqual(PRESETS.medium.terrainShadowSteps);
		expect(PRESETS.medium.terrainShadowSteps).toBeLessThanOrEqual(PRESETS.high.terrainShadowSteps);
	});

	test('the rock tables are sane: layers get finer to coarser, weights add up, the fades are ordered', () => {
		const periods = ROCK_SHADING.strata.map((l) => l.period);
		expect([...periods].sort((a, b) => a - b)).toEqual(periods);
		const w = ROCK_SHADING.macro.reduce((a, m) => a + m.weight, 0);
		expect(w).toBeCloseTo(1, 12);
		expect(ROCK_SHADING.bumpFootprint[0]).toBeLessThan(ROCK_SHADING.bumpFootprint[1]);
		expect(ROCK_SHADING.cliffFrom).toBeLessThan(ROCK_SHADING.cliffFull);
	});
});
