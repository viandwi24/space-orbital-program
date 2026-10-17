/** Sites and flat zones (plan 084, ADR 0142). */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import golden from './fixtures/terrain-legacy.json';
import { goldenDirections, HEIGHT_TOLERANCE, RECORDED_HERE } from './terrain-legacy.test.ts';
import {
	LEGACY_SITE,
	LEGACY_TERRAIN_SEED,
	LEGACY_ZONE,
	MAX_TERRAIN_ZONES,
	cachedPlanetMap,
	createTerrainField,
	lakeLevelAt,
	latLonDirection,
	legacyWorldInfo,
	padLatLon,
	siteSchema,
	sitesOf,
	terrainSeedOf,
	terrainShift,
	worldInfoSchema,
	zonesOf,
	type TerrainZone,
	type Vec3
} from '../src/index.ts';

const R = 600_000;
const DEG = Math.PI / 180;

/** The direction `metres` of arc from (lat, lon) along the bearing `bearing` (rad from north). */
function around(lat: number, lon: number, metres: number, bearing: number): Vec3 {
	const d = metres / R;
	const la = Math.asin(
		Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(bearing)
	);
	const lo =
		lon +
		Math.atan2(
			Math.sin(bearing) * Math.sin(d) * Math.cos(lat),
			Math.cos(d) - Math.sin(lat) * Math.sin(la)
		);
	return latLonDirection(la, lo);
}

describe('a second flat zone', () => {
	// a base on land at latitude 30: found by looking along the parallel for relief
	const second: TerrainZone = {
		latitude: 30 * DEG,
		longitude: 0,
		flatRadius: 3_000,
		blendWidth: 6_000
	};
	const plain = createTerrainField({ radius: R });
	const lon = (() => {
		for (let l = 0; l < 2 * Math.PI; l += 0.01) {
			const ring = Array.from({ length: 16 }, (_, i) =>
				around(second.latitude, l, 20_000, (i * Math.PI) / 8)
			);
			if (ring.every((n) => plain.heightAt(n) > 50)) return l;
		}
		throw new Error('no land with relief at latitude 30');
	})();
	const zone = { ...second, longitude: lon };
	const field = createTerrainField({ radius: R, zones: [LEGACY_ZONE, zone] });
	// the same world with the second zone 1 m wide: same biome map and lake gates, no flattening
	const free = createTerrainField({
		radius: R,
		zones: [LEGACY_ZONE, { ...zone, flatRadius: 1, blendWidth: 1 }]
	});

	test('is flat within its radius (under 0.01 m)', () => {
		let worst = 0;
		for (let i = 0; i < 400; i++) {
			const n = around(
				zone.latitude,
				zone.longitude,
				(i % 20) * (zone.flatRadius / 20),
				(i * 2.4) % (2 * Math.PI)
			);
			worst = Math.max(worst, field.heightAt(n));
		}
		expect(worst).toBeLessThan(0.01);
	});

	test('blends to the noise at its rim and leaves the terrain alone beyond it', () => {
		const rim = zone.flatRadius + zone.blendWidth;
		let below = 0;
		for (let i = 0; i < 64; i++) {
			const b = (i * Math.PI) / 32;
			const mid = around(zone.latitude, zone.longitude, zone.flatRadius + zone.blendWidth / 2, b);
			// half-way through the blend the height is between 0 and the free terrain
			expect(field.heightAt(mid)).toBeLessThanOrEqual(free.heightAt(mid) + 1e-9);
			if (field.heightAt(mid) < free.heightAt(mid)) below++;
			const out = around(zone.latitude, zone.longitude, rim + 500, b);
			expect(field.heightAt(out)).toBe(free.heightAt(out));
		}
		expect(below).toBeGreaterThan(32);
	});

	test('the Legacy zone is still flat, and its massif is the only one', () => {
		expect(field.heightAt(latLonDirection(0, 0))).toBe(0);
		expect(field.heightAt(around(0, 0, 4_000, 1))).toBe(0);
	});
});

describe('seed', () => {
	test('the Legacy seed shifts nothing; another seed moves the field', () => {
		expect(terrainShift(LEGACY_TERRAIN_SEED)).toBe(0);
		expect(terrainShift(7)).not.toBe(0);
		const a = createTerrainField({ radius: R });
		const b = createTerrainField({ radius: R, seed: 7 });
		const dirs = goldenDirections().slice(0, 400);
		const differ = dirs.filter((n) => a.heightAt(n) !== b.heightAt(n)).length;
		expect(differ).toBeGreaterThan(100);
		// the pad stays flat whatever the seed
		expect(b.heightAt(latLonDirection(0, 0))).toBe(0);
	});

	test('the Legacy lake levels equal the pre-084 ones', () => {
		const ctx = { radius: R, map: cachedPlanetMap(1024) };
		const lakes = new Float64Array(goldenDirections().map((n) => lakeLevelAt(n, ctx)));
		const every = Array.from(lakes).filter((_, i) => i % 5 === 0);
		const worst = Math.max(...every.map((v, i) => Math.abs(v - golden.lakesEvery5[i]!)));
		expect(worst).toBeLessThanOrEqual(HEIGHT_TOLERANCE);
		// Bit for bit only on the machine kind that wrote the digest (see terrain-legacy.test.ts).
		const sha = createHash('sha256').update(new Uint8Array(lakes.buffer)).digest('hex');
		if (RECORDED_HERE) expect(sha).toBe(golden.lakesSha256);
	});

	test('more than 8 zones are refused', () => {
		const zones = Array.from({ length: MAX_TERRAIN_ZONES + 1 }, (_, i) => ({
			...LEGACY_ZONE,
			longitude: i
		}));
		expect(() => createTerrainField({ radius: R, zones })).toThrow(/1 to 8/);
	});
});

describe('site data', () => {
	test('the Legacy world has the Legacy site and seed', () => {
		const info = legacyWorldInfo(123);
		expect(sitesOf(info)).toEqual([LEGACY_SITE]);
		expect(terrainSeedOf(info)).toBe(LEGACY_TERRAIN_SEED);
		expect(terrainSeedOf({ id: 'w-1', seed: 99 })).toBe(99);
		expect(zonesOf(sitesOf(info), 'stock.home')).toEqual([LEGACY_ZONE]);
		expect(zonesOf(sitesOf(info), 'stock.cinder')).toEqual([]);
	});

	test('sites parse in the world info; a bad one is refused', () => {
		const info = { ...legacyWorldInfo(1), sites: [LEGACY_SITE] };
		expect(worldInfoSchema.parse(info).sites).toEqual([LEGACY_SITE]);
		expect(siteSchema.safeParse({ ...LEGACY_SITE, pads: [] }).success).toBe(false);
		expect(siteSchema.safeParse({ ...LEGACY_SITE, kind: 'castle' }).success).toBe(false);
	});

	test('a pad offset turns into the right arc', () => {
		const site = { ...LEGACY_SITE, latitude: 30 * DEG };
		const [la, lo] = padLatLon(site, { east: 300, north: -200 }, R);
		const a = latLonDirection(site.latitude, site.longitude);
		const b = latLonDirection(la, lo);
		const arc = R * Math.acos(a.x * b.x + a.y * b.y + a.z * b.z);
		expect(arc).toBeCloseTo(Math.hypot(300, 200), 1);
		expect(padLatLon(LEGACY_SITE, LEGACY_SITE.pads[0]!, R)).toEqual([0, 0]);
	});
});
