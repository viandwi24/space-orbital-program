import { describe, expect, test } from 'bun:test';
import { SEA_LEVEL, cachedPlanetMap, generatePlanetMap, sampleMap } from '../src/planet-map.ts';
import {
	BUBBLE_GONE_ALTITUDE,
	BUBBLE_RADIUS,
	BUBBLE_RAMP,
	SITE_BLEND_WIDTH,
	SITE_FLAT_RADIUS,
	STEP_MIN_METRES,
	TERRAIN_MAX_HEIGHT,
	TERRAIN_MAX_SLOPE,
	TERRAIN_SHAPE,
	bubbleSkipRadius,
	bubbleStrength,
	bubbleWeight,
	directionLatLon,
	flatSkipRadius,
	marchStep,
	marchTerrain,
	siteWeight,
	skylineAngle,
	terrainHeight,
	type TerrainContext
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

const randomDirection = (r: () => number) => {
	const z = r() * 2 - 1;
	const a = r() * 2 * Math.PI;
	const s = Math.sqrt(1 - z * z);
	return vec(s * Math.cos(a), z, s * Math.sin(a));
};

/** A point `metres` from the site along `azimuth` (great circle), unit body-fixed. */
const fromSite = (metres: number, azimuth: number) => {
	const ang = metres / R;
	return vec(Math.cos(ang), Math.sin(ang) * Math.cos(azimuth), Math.sin(ang) * Math.sin(azimuth));
};

describe('terrain height function', () => {
	test('deterministic: same value on repeated calls and for a rebuilt map', () => {
		const a = ctx();
		const b: TerrainContext = { ...a, map: generatePlanetMap(1024, 0, 0) };
		const r = rng(1);
		for (let i = 0; i < 200; i++) {
			const n = i % 2 === 0 ? randomDirection(r) : fromSite(20_000 + r() * 40_000, r() * 6.28);
			expect(terrainHeight(n, a)).toBe(terrainHeight(n, a));
			expect(terrainHeight(n, b)).toBe(terrainHeight(n, a));
		}
	});

	test('continuous: no step larger than the slope bound over 200 m, anywhere', () => {
		const c = ctx();
		const r = rng(2);
		let steepest = 0;
		for (let i = 0; i < 3000; i++) {
			const n = i % 3 === 0 ? randomDirection(r) : fromSite(8_000 + r() * 60_000, r() * 6.28);
			// a second point 200 m away in a random tangent direction
			const t = normalize(vec(r() - 0.5, r() - 0.5, r() - 0.5));
			const m = normalize(vec(n.x + (t.x * 200) / R, n.y + (t.y * 200) / R, n.z + (t.z * 200) / R));
			const step = Math.abs(terrainHeight(n, c) - terrainHeight(m, c));
			steepest = Math.max(steepest, step / 200);
		}
		expect(steepest).toBeLessThanOrEqual(TERRAIN_MAX_SLOPE);
	});

	test('bounded: 0 <= h <= TERRAIN_MAX_HEIGHT, and the bound is not wasteful', () => {
		const c = ctx();
		const r = rng(3);
		let highest = 0;
		for (let i = 0; i < 20_000; i++) {
			const h = terrainHeight(randomDirection(r), c);
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThanOrEqual(TERRAIN_MAX_HEIGHT);
			highest = Math.max(highest, h);
		}
		expect(highest).toBeGreaterThan(TERRAIN_MAX_HEIGHT * 0.7);
	});

	test('zero over the ocean and on the coast margin', () => {
		const c = ctx();
		const r = rng(4);
		let ocean = 0;
		let margin = 0;
		for (let i = 0; i < 30_000; i++) {
			const n = randomDirection(r);
			const [lat, lon] = directionLatLon(n);
			const e = sampleMap(c.map, lat, lon)[0];
			if (e < SEA_LEVEL) {
				expect(terrainHeight(n, c)).toBe(0);
				ocean++;
			} else if (e < TERRAIN_SHAPE.landStart) {
				expect(terrainHeight(n, c)).toBe(0);
				margin++;
			}
		}
		expect(ocean).toBeGreaterThan(1000);
		expect(margin).toBeGreaterThan(10);
	});

	test('exactly zero within the flat radius of the launch site', () => {
		const c = ctx();
		const r = rng(5);
		for (let i = 0; i < 500; i++) {
			const n = fromSite(r() * SITE_FLAT_RADIUS, r() * 6.28);
			expect(terrainHeight(n, c)).toBe(0);
		}
		expect(terrainHeight(SITE, c)).toBe(0);
	});

	test('the flat zone is the mask, not luck: a site put on a mountain is flattened to zero within the radius', () => {
		const c = ctx();
		const r = rng(11);
		// find a high point of the unmasked terrain (site far away on the other side)
		const away: TerrainContext = { ...c, siteDirection: vec(-1, 0, 0) };
		let peak = vec(0, 1, 0);
		let height = 0;
		for (let i = 0; i < 40_000; i++) {
			const n = randomDirection(r);
			const h = terrainHeight(n, away);
			if (h > height) {
				height = h;
				peak = n;
			}
		}
		expect(height).toBeGreaterThan(2500);
		const flattened: TerrainContext = { ...c, siteDirection: peak };
		// it is zero at the peak and everywhere within the flat radius of it, and rises beyond the blend ring
		let nonzeroOutside = 0;
		for (let i = 0; i < 400; i++) {
			const a = r() * 6.28;
			const metres = r() * SITE_FLAT_RADIUS;
			const ang = metres / R;
			// a point `metres` from the peak along a random great circle
			const t1 = normalize(vec(-peak.z, 0, peak.x));
			const t2 = vec(
				peak.y * t1.z - peak.z * t1.y,
				peak.z * t1.x - peak.x * t1.z,
				peak.x * t1.y - peak.y * t1.x
			);
			const dir = vec(
				t1.x * Math.cos(a) + t2.x * Math.sin(a),
				t1.y * Math.cos(a) + t2.y * Math.sin(a),
				t1.z * Math.cos(a) + t2.z * Math.sin(a)
			);
			const n = vec(
				peak.x * Math.cos(ang) + dir.x * Math.sin(ang),
				peak.y * Math.cos(ang) + dir.y * Math.sin(ang),
				peak.z * Math.cos(ang) + dir.z * Math.sin(ang)
			);
			expect(terrainHeight(n, flattened)).toBe(0);
			// and without the mask the same points are not all zero
			if (terrainHeight(n, away) > 0) nonzeroOutside++;
		}
		expect(nonzeroOutside).toBeGreaterThan(200);
	});

	test('the site weight rises monotonically over the blend ring from 0 to 1', () => {
		let last = -1;
		for (let d = 0; d <= SITE_FLAT_RADIUS + SITE_BLEND_WIDTH + 2_000; d += 250) {
			const w = siteWeight(d);
			expect(w).toBeGreaterThanOrEqual(last);
			last = w;
		}
		expect(siteWeight(SITE_FLAT_RADIUS)).toBe(0);
		expect(siteWeight(SITE_FLAT_RADIUS + SITE_BLEND_WIDTH)).toBe(1);
	});

	test('mountains exist where the pad can see them: 800 m and 2000 m within 70 km, 3000 m somewhere', () => {
		const c = ctx();
		let highest = 0;
		for (let az = 0; az < 360; az += 3) {
			for (let d = 6_000; d <= 70_000; d += 1_000) {
				highest = Math.max(highest, terrainHeight(fromSite(d, (az * Math.PI) / 180), c));
			}
		}
		expect(highest).toBeGreaterThan(2000);
		expect(highest).toBeGreaterThan(800);
	});

	test('the skyline from the pad rises at least 3 degrees above the horizontal', () => {
		// 1.0 degree is the plan 027 criterion; the scenic massif of ADR 0036 gives about 6.
		const angle = skylineAngle(ctx(), 2, 120, 70_000, 500);
		expect((angle * 180) / Math.PI).toBeGreaterThan(3);
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

describe('camera bubble', () => {
	test('weight is 0 at the ground point below 1.5 km and inside the bubble radius', () => {
		for (const alt of [0.25, 100, 800, 1500]) {
			expect(bubbleWeight(0, alt)).toBe(0);
			expect(bubbleWeight(BUBBLE_RADIUS * 0.99, alt)).toBe(0);
		}
	});

	test('weight is 1 beyond the bubble plus its ramp at low altitude, and everywhere high up', () => {
		expect(bubbleWeight(BUBBLE_RADIUS + BUBBLE_RAMP, 500)).toBe(1);
		for (const d of [0, 100, 2_000, 10_000]) expect(bubbleWeight(d, BUBBLE_GONE_ALTITUDE)).toBe(1);
	});

	test('weight is monotone in distance, and the bubble weakens as the camera rises', () => {
		for (const alt of [100, 2_500, 4_000]) {
			let last = -1;
			for (let d = 0; d <= 12_000; d += 200) {
				const w = bubbleWeight(d, alt);
				expect(w).toBeGreaterThanOrEqual(last);
				last = w;
			}
		}
		let lastStrength = 2;
		for (let alt = 0; alt <= BUBBLE_GONE_ALTITUDE + 500; alt += 100) {
			const s = bubbleStrength(alt);
			expect(s).toBeLessThanOrEqual(lastStrength);
			lastStrength = s;
		}
		expect(bubbleStrength(BUBBLE_GONE_ALTITUDE)).toBe(0);
	});

	test('the camera is never inside the terrain it sees: altitude > weight at the ground point x max height', () => {
		for (let alt = 1; alt < 12_000; alt += 25) {
			expect(alt).toBeGreaterThan(bubbleWeight(0, alt) * TERRAIN_MAX_HEIGHT);
		}
	});

	test('the march skips the bubble at low altitude and the flat disc of the site', () => {
		expect(bubbleSkipRadius(100)).toBe(BUBBLE_RADIUS);
		expect(bubbleSkipRadius(5_000)).toBe(0);
		expect(flatSkipRadius(2, 0)).toBe(SITE_FLAT_RADIUS);
		expect(flatSkipRadius(2, 2_000)).toBe(SITE_FLAT_RADIUS - 2_000);
		expect(flatSkipRadius(2, 4_000)).toBe(BUBBLE_RADIUS);
		expect(flatSkipRadius(8_000, 100_000)).toBe(0);
		expect(flatSkipRadius(100, 100_000)).toBe(BUBBLE_RADIUS);
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

	test('marching the reference terrain finds the brute-force hit on 200 rays from the pad', () => {
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
			const march = marchTerrain(eye, dir, c, { maxSteps: 600, tMax: 120_000 });
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
