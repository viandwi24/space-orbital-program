/** Plan 402 (ADR 0339): rocks by cell are a pure function of the body, the world and the cell. */
import { describe, expect, test } from 'bun:test';
import {
	createTerrainField,
	latLonDirection,
	type TerrainField,
	type TerrainZone
} from '@orbital/core';
import {
	SCATTER,
	biomeWeight,
	groundSlope,
	rockInCell,
	rocksAround,
	siteArc,
	type ScatterContext
} from '../src/rock-scatter.ts';

const RADIUS = 600_000;
const SITE: TerrainZone = { latitude: 0, longitude: 0, flatRadius: 5_000, blendWidth: 11_000 };
const real = createTerrainField({ radius: RADIUS, zones: [SITE] });
const context = (over: Partial<ScatterContext> = {}): ScatterContext => ({
	radius: RADIUS,
	terrain: real,
	zones: [SITE],
	seed: 1,
	density: 1,
	...over
});
/** A spot 30 km from the site, over land. */
const AWAY = latLonDirection(0.02, 0.03);
/** A constant height and no water: the biome weight is the same everywhere. */
const flat = (height: number): TerrainField => ({ maxHeight: height, heightAt: () => height });

describe('rocks by cell (plan 402)', () => {
	test('the same cell gives the same rock, whatever was asked in between', () => {
		const a = rocksAround(context(), AWAY, 120);
		expect(a.length).toBeGreaterThan(20);
		// another place, another world, then the first again: nothing is kept between calls
		rocksAround(context({ seed: 9 }), latLonDirection(0.5, 1.2), 200);
		const b = rocksAround(context(), AWAY, 120);
		expect(b.map((r) => r.key)).toEqual(a.map((r) => r.key));
		expect(b[0]!.direction).toEqual(a[0]!.direction);
		expect(b[0]!.radius).toBe(a[0]!.radius);
		// a rock found from a point 40 m away is the same rock
		const c = rocksAround(context(), latLonDirection(0.02, 0.03 + 40 / RADIUS), 120);
		const shared = c.find((r) => r.key === a[0]!.key);
		expect(shared).toBeDefined();
		expect(shared!.yaw).toBe(a[0]!.yaw);
		expect(shared!.shade).toBe(a[0]!.shade);
	});

	test('a cell is one rock or none, and rockInCell agrees with rocksAround', () => {
		const ctx = context();
		const list = rocksAround(ctx, AWAY, 60);
		for (const r of list.slice(0, 10)) {
			const [cls, face, i, j] = r.key.split(':').map(Number) as [number, number, number, number];
			const again = rockInCell(ctx, cls, face, i, j);
			expect(again?.key).toBe(r.key);
			expect(again?.radius).toBe(r.radius);
		}
	});

	test('density 0 places none; half the density roughly halves them', () => {
		expect(rocksAround(context({ density: 0 }), AWAY, 200)).toHaveLength(0);
		const full = rocksAround(context(), AWAY, 150).length;
		const half = rocksAround(context({ density: 0.5 }), AWAY, 150).length;
		expect(half).toBeGreaterThan(full * 0.3);
		expect(half).toBeLessThan(full * 0.7);
	});

	test('no rock is larger than the size cut', () => {
		const list = rocksAround(context(), AWAY, 400, 10_000);
		expect(list.length).toBeGreaterThan(100);
		expect(Math.max(...list.map((r) => r.radius))).toBeLessThanOrEqual(SCATTER.sizeCut);
	});

	test('the biome limits hold: none in water, on the shore or in the snow; steep ground is busy', () => {
		expect(biomeWeight(1, 0.1, false)).toBe(0);
		expect(biomeWeight(500, 0.1, true)).toBe(0);
		expect(biomeWeight(3_700, 0.1, false)).toBe(0);
		expect(biomeWeight(20, 0.1, false)).toBeLessThan(biomeWeight(500, 0.1, false));
		expect(biomeWeight(500, 0.5, false)).toBeGreaterThan(biomeWeight(500, 0.1, false));
		expect(biomeWeight(500, 1.5, false)).toBeLessThan(biomeWeight(500, 0.5, false));
		// on a plateau in the snow, or at sea level, the lattice is empty
		expect(rocksAround(context({ terrain: flat(3_800) }), AWAY, 300)).toHaveLength(0);
		expect(rocksAround(context({ terrain: flat(0) }), AWAY, 300)).toHaveLength(0);
		expect(rocksAround(context({ terrain: flat(600) }), AWAY, 300).length).toBeGreaterThan(20);
	});

	test('the site keeps its own ground: none near it, the full amount far from it', () => {
		const near = latLonDirection(0, 300 / RADIUS);
		expect(siteArc(near, RADIUS, [SITE])).toBeCloseTo(300, 0);
		const ctx = context({ terrain: flat(600) });
		expect(rocksAround(ctx, near, 200)).toHaveLength(0);
		const mid = latLonDirection(0, 1_800 / RADIUS);
		const far = latLonDirection(0, 12_000 / RADIUS);
		expect(rocksAround(ctx, mid, 100).length).toBeLessThan(rocksAround(ctx, far, 100).length);
		for (const r of rocksAround(ctx, latLonDirection(0, 900 / RADIUS), 300))
			expect(siteArc(r.direction, RADIUS, [SITE])).toBeGreaterThan(SCATTER.siteClear);
	});

	test('a rock stands on the ground the sim has: its height is the terrain field there', () => {
		for (const r of rocksAround(context(), AWAY, 80).slice(0, 12)) {
			expect(r.height).toBe(real.heightAt(r.direction));
			const g = groundSlope(real, RADIUS, r.direction);
			expect(r.normal.x).toBeCloseTo(g.normal.x, 9);
		}
	});
});
