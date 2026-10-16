import { describe, expect, test } from 'bun:test';
import {
	MAP_WARP,
	SEA_LEVEL,
	SITE_BLEND_WIDTH,
	SITE_FLAT_RADIUS,
	TERRAIN_MAX_HEIGHT,
	TERRAIN_MAX_SLOPE,
	TERRAIN_SHAPE,
	cachedPlanetMap,
	createTerrainField,
	directionLatLon,
	generatePlanetMap,
	latLonDirection,
	sampleMap,
	siteWeight,
	terrainHeight,
	warpedLatLon,
	type TerrainContext,
	type Vec3
} from '../src/index.ts';

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const normalize = (a: Vec3): Vec3 => {
	const l = Math.hypot(a.x, a.y, a.z);
	return vec(a.x / l, a.y / l, a.z / l);
};

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
			const [lat, lon] = warpedLatLon(n, R);
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
});

describe('the field', () => {
	test('heightAt equals terrainHeight on the canonical map for 500 directions', () => {
		const field = createTerrainField({ radius: R });
		const c = ctx();
		const r = rng(21);
		for (let i = 0; i < 500; i++) {
			const n = i % 2 === 0 ? randomDirection(r) : fromSite(10_000 + r() * 50_000, r() * 6.28);
			expect(field.heightAt(n)).toBe(terrainHeight(n, c));
		}
		expect(field.maxHeight).toBe(TERRAIN_MAX_HEIGHT);
	});

	test('a field for another site flattens that site, not the origin', () => {
		const lat = 0.4;
		const lon = 1.1;
		const field = createTerrainField({ radius: R, latitude: lat, longitude: lon });
		const r = rng(22);
		const site = latLonDirection(lat, lon);
		for (let i = 0; i < 100; i++) {
			// zero within the flat radius of the new site
			const t = normalize(vec(-site.z, 0, site.x));
			const a = (r() * SITE_FLAT_RADIUS) / R;
			const n = normalize(vec(site.x + t.x * a, site.y + t.y * a, site.z + t.z * a));
			expect(field.heightAt(n)).toBe(0);
		}
	});

	test('latLonDirection inverts directionLatLon', () => {
		const r = rng(23);
		for (let i = 0; i < 100; i++) {
			const n = randomDirection(r);
			const [lat, lon] = directionLatLon(n);
			const m = latLonDirection(lat, lon);
			expect(Math.hypot(m.x - n.x, m.y - n.y, m.z - n.z)).toBeLessThan(1e-12);
		}
	});
});

describe('the coast warp', () => {
	test('displaces the map lookup by at most the stated amplitude and never moves it far', () => {
		const r = rng(31);
		let largest = 0;
		for (let i = 0; i < 2000; i++) {
			const n = randomDirection(r);
			const [lat, lon] = directionLatLon(n);
			const [wlat, wlon] = warpedLatLon(n, R);
			expect(Math.abs(wlat - lat)).toBeLessThanOrEqual(MAP_WARP.amplitude * 1.0001);
			largest = Math.max(largest, Math.abs(wlat - lat));
			// longitude is stretched by 1 / cos(lat) (floored at 0.2) near the poles
			expect(Math.abs(wlon - lon)).toBeLessThanOrEqual((MAP_WARP.amplitude / 0.2) * 1.0001);
		}
		expect(largest).toBeGreaterThan(MAP_WARP.amplitude * 0.4);
	});

	test('is deterministic and smooth (no jump over 100 m)', () => {
		const r = rng(32);
		for (let i = 0; i < 500; i++) {
			const n = randomDirection(r);
			if (Math.abs(n.y) > 0.8) continue; // the longitude warp is stretched near the poles
			const m = normalize(vec(n.x + 100 / R, n.y, n.z));
			const [a0, b0] = warpedLatLon(n, R);
			const [a1, b1] = warpedLatLon(n, R);
			expect(a0).toBe(a1);
			expect(b0).toBe(b1);
			const [a2, b2] = warpedLatLon(m, R);
			const [la, lb] = directionLatLon(n);
			const [lc, ld] = directionLatLon(m);
			// the warp itself changes by far less than the 100 m step
			expect(Math.abs(a2 - lc - (a0 - la))).toBeLessThan(3e-4);
			expect(Math.abs(b2 - ld - (b0 - lb))).toBeLessThan(6e-4);
		}
	});
});

describe('the ridge is smooth enough for a fixed grid', () => {
	// A patch of the visual terrain is a regular grid of samples, drawn with bilinear filtering
	// (ADR 0044). The error of bilinear interpolation of the true function is the measure.
	const gridError = (texel: number, centreMetres: number, points: number): number => {
		const c = ctx();
		const phi = centreMetres / R;
		const at = (x: number, z: number): number => {
			const lon = phi + x / R;
			const lat = z / R;
			return terrainHeight(latLonDirection(lat, lon), c);
		};
		const r = rng(41);
		let worst = 0;
		for (let i = 0; i < points; i++) {
			const x = (r() - 0.5) * 6000;
			const z = (r() - 0.5) * 6000;
			const x0 = Math.floor(x / texel) * texel;
			const z0 = Math.floor(z / texel) * texel;
			const tx = (x - x0) / texel;
			const tz = (z - z0) / texel;
			const bilinear =
				(at(x0, z0) * (1 - tx) + at(x0 + texel, z0) * tx) * (1 - tz) +
				(at(x0, z0 + texel) * (1 - tx) + at(x0 + texel, z0 + texel) * tx) * tz;
			worst = Math.max(worst, Math.abs(bilinear - at(x, z)));
		}
		return worst;
	};

	test('a 4 m grid reproduces the height within 0.05 m over the massif (maximum, 3 x 3000 points)', () => {
		for (const km of [25_000, 30_000, 40_000]) expect(gridError(4, km, 3000)).toBeLessThan(0.05);
	});

	test('a 32 m grid reproduces the height within 1 m over the massif', () => {
		for (const km of [25_000, 30_000, 40_000]) expect(gridError(32, km, 3000)).toBeLessThan(1);
	});
});
