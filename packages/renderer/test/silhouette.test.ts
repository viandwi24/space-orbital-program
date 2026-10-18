/** Plan 133 / ADR 0195: the silhouette coverage of the planet pass, on the CPU twin of its march. */
import { describe, expect, test } from 'bun:test';
import { cachedPlanetMap, terrainHeight, type TerrainContext } from '@orbital/core';
import { marchTerrain, parabolaMin, silhouetteCoverage } from '../src/terrain-model.ts';
import { normalize, vec } from '../src/vec.ts';

const R = 600_000;
const SITE = vec(1, 0, 0);
const ctx: TerrainContext = { radius: R, map: cachedPlanetMap(1024), siteDirection: SITE };
const PIXEL = 0.0009;
const eye = vec(R + terrainHeight(SITE, ctx) + 2, 0, 0);

/** The ray from the pad at `elev` radians above the horizontal, toward `az`. */
const ray = (az: number, elev: number) =>
	normalize(vec(Math.sin(elev), Math.cos(elev) * Math.cos(az), Math.cos(elev) * Math.sin(az)));
const march = (az: number, elev: number) =>
	marchTerrain(eye, ray(az, elev), ctx, { maxSteps: 600, tMax: 120_000, pixelAngle: PIXEL });

describe('silhouette coverage (plan 133)', () => {
	test('half covered at a grazing miss, clear from half a footprint up', () => {
		expect(silhouetteCoverage(0)).toBe(0.5);
		expect(silhouetteCoverage(0.25)).toBe(0.25);
		expect(silhouetteCoverage(0.5)).toBe(0);
		expect(silhouetteCoverage(3)).toBe(0);
	});

	test('the parabola through three clearances finds the lowest point between them', () => {
		const f = (u: number) => 2 * (u - 1) ** 2 + 3;
		const v = parabolaMin(-2, f(-2), f(0), 3, f(3))!;
		expect(v.u).toBeCloseTo(1, 9);
		expect(v.c).toBeCloseTo(3, 9);
		expect(parabolaMin(-2, 1, 5, 3, 1)).toBeUndefined(); // opens downwards
	});

	test('just above the skyline the closest approach is within half a footprint, or a crest crossed', () => {
		let checked = 0;
		let clearAbove = 0;
		for (let az = 0; az < 2 * Math.PI && checked < 12; az += 0.37) {
			// bracket the skyline at this azimuth: a hit below, a miss above
			let lo = -0.02;
			let hi = 0.2;
			if (!march(az, lo).hit || march(az, hi).hit) continue;
			for (let k = 0; k < 30; k++) {
				const mid = 0.5 * (lo + hi);
				if (march(az, mid).hit) lo = mid;
				else hi = mid;
			}
			const miss = march(az, hi);
			expect(miss.hit).toBe(false);
			// covered (the blend applies), or below zero: a crest the samples stepped over, which the
			// planet pass takes as a hit instead of the sea far behind it
			expect(miss.closest.s).toBeLessThan(0.5);
			if (miss.closest.s >= 0) expect(silhouetteCoverage(miss.closest.s)).toBeGreaterThan(0);
			// three pixels higher the ray is clear of that crest
			if (silhouetteCoverage(march(az, hi + 3 * PIXEL).closest.s) === 0) clearAbove++;
			checked++;
		}
		expect(checked).toBeGreaterThanOrEqual(6);
		expect(clearAbove / checked).toBeGreaterThanOrEqual(0.8);
	});
});
