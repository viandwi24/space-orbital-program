import { describe, expect, test } from 'bun:test';
import {
	SEA_LEVEL,
	SITE_FLAT_RADIUS,
	TERRAIN_MAX_SLOPE,
	cachedPlanetMap,
	terrainHeight,
	type TerrainContext
} from '@orbital/core';
import {
	STEP_MIN_METRES,
	TERRAIN_MARCH_SLOPE_MIN,
	localMarchSlope,
	flatSkipRadius,
	marchStep,
	marchTerrain,
	skylineAngle
} from '../src/terrain-model.ts';
import { normalize, scale, vec } from '../src/vec.ts';

const R = 600_000;
const SITE = vec(1, 0, 0);
const ctx = (): TerrainContext => ({
	radius: R,
	map: cachedPlanetMap(1024, 0, 0),
	siteDirection: SITE
});

/** Deterministic pseudo-random numbers in [0, 1). */
function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/** A point `metres` from the site along `azimuth` (great circle), unit body-fixed. */
const fromSite = (metres: number, azimuth: number) => {
	const ang = metres / R;
	return vec(Math.cos(ang), Math.sin(ang) * Math.cos(azimuth), Math.sin(ang) * Math.sin(azimuth));
};

describe('skyline from the pad', () => {
	test('the skyline from the pad rises at least 6 degrees above the horizontal', () => {
		// 1.0 degree was the plan 027 criterion and the massif of ADR 0036 gave 5.9; plan 031 moved the ring in (12 to 21 km out) for 7.1.
		const angle = skylineAngle(ctx(), 2, 120, 70_000, 500);
		expect((angle * 180) / Math.PI).toBeGreaterThan(6);
	});

	test('the skyline is varied: some azimuths see mountains, some a low horizon', () => {
		const c = ctx();
		const per: number[] = [];
		for (let az = 0; az < 24; az++) {
			let best = -9;
			for (let d = 500; d <= 70_000; d += 500) {
				const ang = d / R;
				const azimuth = (az / 24) * 2 * Math.PI;
				const n = fromSite(d, azimuth);
				const drop = R * (1 - Math.cos(ang));
				best = Math.max(best, Math.atan2(terrainHeight(n, c) - drop - 2, R * Math.sin(ang)));
			}
			per.push((best * 180) / Math.PI);
		}
		expect(Math.max(...per)).toBeGreaterThan(4);
		expect(Math.min(...per)).toBeLessThan(2);
	});
});

describe('local march slope', () => {
	test('is the margin on flat ground, grows with the gradient and never exceeds the global bound', () => {
		expect(localMarchSlope(0)).toBe(TERRAIN_MARCH_SLOPE_MIN);
		let last = 0;
		for (let g = 0; g < 2; g += 0.05) {
			const s = localMarchSlope(g);
			expect(s).toBeGreaterThanOrEqual(last);
			expect(s).toBeLessThanOrEqual(TERRAIN_MAX_SLOPE);
			last = s;
		}
		expect(localMarchSlope(1)).toBe(TERRAIN_MAX_SLOPE);
	});
});

describe('flat skip', () => {
	test('the march skips what is left of the launch site flat disc', () => {
		expect(flatSkipRadius(0)).toBe(SITE_FLAT_RADIUS);
		expect(flatSkipRadius(2_000)).toBe(SITE_FLAT_RADIUS - 2_000);
		expect(flatSkipRadius(100_000)).toBe(0);
	});
});

describe('march step rule', () => {
	test('monotone in clearance, never below the floor, never above the safe step when it dominates', () => {
		let last = 0;
		for (let c = 0; c <= 5_000; c += 50) {
			const s = marchStep(c, 0.2, 10_000, 0.0009);
			expect(s).toBeGreaterThanOrEqual(last);
			expect(s).toBeGreaterThanOrEqual(STEP_MIN_METRES);
			last = s;
		}
		const safe = (c: number, d: number) => (0.8 * c) / (TERRAIN_MAX_SLOPE + Math.max(d, 0));
		for (const [c, d, t] of [
			[3000, 0.3, 500],
			[800, 0.0, 200],
			[1500, -0.2, 1000]
		] as const) {
			const s = marchStep(c, d, t, 0.0009);
			expect(s).toBeLessThanOrEqual(Math.max(safe(c, d), t * 0.05 + 1e-9, t * 0.0009 * 1.5 + 3));
		}
	});

	test('a ray cannot tunnel: the step shrinks as it descends toward the ground', () => {
		let last = Infinity;
		for (let c = 3000; c >= 10; c -= 100) {
			const s = marchStep(c, 0.5, 50, 0.0009);
			expect(s).toBeLessThanOrEqual(last);
			last = s;
		}
	});

	for (const adaptive of [false, true])
		test(`marching the reference terrain finds the brute-force hit on 200 rays from the pad (${adaptive ? 'local slope bound of ADR 0044' : 'global slope bound'})`, () => {
			const ADAPTIVE = adaptive;
			const c = ctx();
			const r = rng(7);
			const eye = scale(SITE, R + 2);
			const east = vec(0, 0, 1);
			const north = vec(0, 1, 0);
			let agree = 0;
			let compared = 0;
			let hits = 0;
			for (let i = 0; i < 200; i++) {
				const az = r() * 2 * Math.PI;
				const elev = (r() * 7 - 1.5) * (Math.PI / 180);
				const h = vec(
					east.x * Math.cos(az) + north.x * Math.sin(az),
					east.y * Math.cos(az) + north.y * Math.sin(az),
					east.z * Math.cos(az) + north.z * Math.sin(az)
				);
				const dir = normalize(
					vec(
						SITE.x * Math.sin(elev) + h.x * Math.cos(elev),
						SITE.y * Math.sin(elev) + h.y * Math.cos(elev),
						SITE.z * Math.sin(elev) + h.z * Math.cos(elev)
					)
				);
				const march = marchTerrain(eye, dir, c, {
					maxSteps: 600,
					tMax: 120_000,
					adaptive: ADAPTIVE
				});
				// brute force every 25 m
				let brute: number | null = null;
				for (let t = 0; t < 120_000; t += 25) {
					const p = vec(eye.x + dir.x * t, eye.y + dir.y * t, eye.z + dir.z * t);
					const rr = Math.hypot(p.x, p.y, p.z);
					if (rr - R - terrainHeight(normalize(p), c) < 0) {
						brute = t;
						break;
					}
				}
				if (brute !== null) hits++;
				compared++;
				if ((brute === null) === !march.hit) {
					if (brute === null || Math.abs(march.t - brute) <= Math.max(0.01 * brute, 60)) agree++;
				}
			}
			expect(hits).toBeGreaterThan(20);
			expect(agree / compared).toBeGreaterThanOrEqual(0.97);
		});
});
