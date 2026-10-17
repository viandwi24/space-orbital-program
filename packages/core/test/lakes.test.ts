import { describe, expect, test } from 'bun:test';
import {
	LAKE_SHAPE,
	SEA_LEVEL,
	TERRAIN_MAX_HEIGHT,
	TERRAIN_MAX_SLOPE,
	cachedPlanetMap,
	createTerrainField,
	isLake,
	lakeCap,
	lakeDepthAt,
	lakeGate,
	lakeLevel,
	lakeLevelAt,
	lakePotential,
	latLonDirection,
	sampleMap,
	terrainHeight,
	warpedLatLon,
	type TerrainContext,
	type Vec3
} from '../src/index.ts';

const R = 600_000;
const ctx: TerrainContext = {
	radius: R,
	map: cachedPlanetMap(1024),
	siteDirection: { x: 1, y: 0, z: 0 }
};

function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}
const randomDirection = (r: () => number): Vec3 =>
	latLonDirection(Math.asin(2 * r() - 1), (r() - 0.5) * 2 * Math.PI);
const tangentStep = (n: Vec3, metres: number, r: () => number): Vec3 => {
	const t = { x: r() - 0.5, y: r() - 0.5, z: r() - 0.5 };
	const l = Math.hypot(t.x, t.y, t.z);
	const m = {
		x: n.x + ((t.x / l) * metres) / R,
		y: n.y + ((t.y / l) * metres) / R,
		z: n.z + ((t.z / l) * metres) / R
	};
	const ml = Math.hypot(m.x, m.y, m.z);
	return { x: m.x / ml, y: m.y / ml, z: m.z / ml };
};
const levelOf = (n: Vec3): number => lakeLevelAt(n, ctx);

/** A grid over the sphere (equal in longitude and latitude) of 1.8 km texels at the equator. */
const W = 2048;
const H = 1024;
const lake = new Uint8Array(W * H);
let land = 0;
let lakeArea = 0;
for (let j = 0; j < H; j++) {
	const lat = ((j + 0.5) / H - 0.5) * Math.PI;
	for (let i = 0; i < W; i++) {
		const n = latLonDirection(lat, ((i + 0.5) / W - 0.5) * 2 * Math.PI);
		const [la, lo] = warpedLatLon(n, R);
		if (sampleMap(ctx.map, la, lo)[0] < SEA_LEVEL) continue;
		land += Math.cos(lat);
		if (isLake(n, ctx)) {
			lake[j * W + i] = 1;
			lakeArea += Math.cos(lat);
		}
	}
}
function basinSizes(): number[] {
	const seen = new Uint8Array(lake.length);
	const sizes: number[] = [];
	for (let s = 0; s < lake.length; s++) {
		if (!lake[s] || seen[s]) continue;
		let size = 0;
		const stack = [s];
		seen[s] = 1;
		while (stack.length) {
			const c = stack.pop()!;
			size++;
			const ci = c % W;
			const cj = (c / W) | 0;
			for (const [di, dj] of [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1]
			] as const) {
				const nj = cj + dj;
				if (nj < 0 || nj >= H) continue;
				const q = nj * W + ((ci + di + W) % W);
				if (lake[q] && !seen[q]) {
					seen[q] = 1;
					stack.push(q);
				}
			}
		}
		sizes.push(size);
	}
	return sizes.sort((a, b) => b - a);
}

describe('lakes (plan 038, ADR 0072)', () => {
	test('the potential is deterministic and in 0..1; the gate is 0 near the site and 1 far from it', () => {
		const r = rng(5);
		for (let i = 0; i < 500; i++) {
			const n = randomDirection(r);
			const q = { x: (n.x * R) / 1000, y: (n.y * R) / 1000, z: (n.z * R) / 1000 };
			const p = lakePotential(q);
			expect(p).toBe(lakePotential(q));
			expect(p).toBeGreaterThanOrEqual(0);
			expect(p).toBeLessThanOrEqual(1);
		}
		expect(lakeGate(0)).toBe(0);
		expect(lakeGate(LAKE_SHAPE.siteFrom)).toBe(0);
		expect(lakeGate(LAKE_SHAPE.siteTo)).toBe(1);
		expect(lakeGate(55_000)).toBeGreaterThan(0);
		expect(lakeGate(55_000)).toBeLessThan(1);
	});

	test('the gradient bound of the level holds (measured over 300 000 pairs, 200 m apart)', () => {
		const r = rng(6);
		let steepest = 0;
		for (let i = 0; i < 300_000; i++) {
			// half the pairs anywhere, half in the ring where the site gate opens
			const ring = (LAKE_SHAPE.siteFrom + r() * (LAKE_SHAPE.siteTo - LAKE_SHAPE.siteFrom)) / R;
			const az = r() * 2 * Math.PI;
			const n =
				i % 2 === 0
					? randomDirection(r)
					: {
							x: Math.cos(ring),
							y: Math.sin(ring) * Math.cos(az),
							z: Math.sin(ring) * Math.sin(az)
						};
			const m = tangentStep(n, 200, r);
			steepest = Math.max(steepest, Math.abs(levelOf(n) - levelOf(m)) / 200);
		}
		expect(steepest).toBeLessThanOrEqual(LAKE_SHAPE.gradientBound);
		// and the bound is not wasteful: the measured maximum is at least 60 percent of it
		expect(steepest).toBeGreaterThan(LAKE_SHAPE.gradientBound * 0.6);
	});

	test('lakes cover 0.5 to 4 percent of the land, as at least 20 basins of 4 texels or more', () => {
		const share = lakeArea / land;
		expect(share).toBeGreaterThan(0.005);
		expect(share).toBeLessThan(0.04);
		expect(basinSizes().filter((s) => s >= 4).length).toBeGreaterThanOrEqual(20);
	});

	test('the ground is exactly at sea level on a lake, and no lake is within the site gate', () => {
		const field = createTerrainField({ radius: R });
		let checked = 0;
		for (let j = 0; j < H; j += 1) {
			for (let i = 0; i < W; i += 1) {
				if (!lake[j * W + i]) continue;
				const n = latLonDirection(
					((j + 0.5) / H - 0.5) * Math.PI,
					((i + 0.5) / W - 0.5) * 2 * Math.PI
				);
				expect(terrainHeight(n, ctx)).toBe(0);
				if (checked % 50 === 0) expect(field.heightAt(n)).toBe(0);
				expect(R * Math.acos(Math.min(1, n.x))).toBeGreaterThan(LAKE_SHAPE.siteFrom);
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(500);
	});

	test('the cap never lets the height exceed the cone, and is inactive near the site', () => {
		const r = rng(7);
		for (let i = 0; i < 20_000; i++) {
			const n = randomDirection(r);
			expect(terrainHeight(n, ctx)).toBeLessThanOrEqual(lakeCap(levelOf(n)) + 1e-9);
		}
		// within the gate's closed zone the cap is above the highest ground: the pad's terrain is unchanged (within siteFrom the gate is closed)
		for (let i = 0; i < 2000; i++) {
			const a = 8_000 + r() * 20_000;
			const az = r() * 6.28;
			const ang = a / R;
			const n = {
				x: Math.cos(ang),
				y: Math.sin(ang) * Math.cos(az),
				z: Math.sin(ang) * Math.sin(az)
			};
			expect(lakeCap(levelOf(n))).toBeGreaterThan(TERRAIN_MAX_HEIGHT);
			expect(terrainHeight(n, ctx)).toBeLessThanOrEqual(TERRAIN_MAX_HEIGHT);
		}
	});

	test("the cap is a cone: its slope is at most LAKE_SHAPE.slope, and where it binds so is the ground's", () => {
		// The ground is the minimum of the old height and the cap, so it is no steeper than the steeper of the two;
		// the old height's own slope is plan 031's (terrain.test.ts), the cap's is this plan's.
		const r = rng(8);
		let capSteepest = 0;
		let boundSteepest = 0;
		let bound = 0;
		let count = 0;
		for (let i = 0; i < 6_000_000 && count < 80_000; i++) {
			const n = randomDirection(r);
			const c1 = lakeCap(levelOf(n));
			if (c1 > 3000 || c1 <= 0) continue;
			count++;
			for (const d of [40, 200]) {
				const m = tangentStep(n, d, r);
				const c2 = lakeCap(levelOf(m));
				capSteepest = Math.max(capSteepest, Math.abs(c1 - c2) / d);
				const h1 = terrainHeight(n, ctx);
				const h2 = terrainHeight(m, ctx);
				if (Math.abs(h1 - c1) < 1e-9 && Math.abs(h2 - c2) < 1e-9) {
					bound++;
					boundSteepest = Math.max(boundSteepest, Math.abs(h1 - h2) / d);
				}
			}
		}
		expect(count).toBe(80_000);
		// the cone's slope is what keeps the ground under the bound where the cap binds, whatever the sampled gradients were
		expect(LAKE_SHAPE.slope).toBeLessThanOrEqual(TERRAIN_MAX_SLOPE);
		expect(capSteepest).toBeLessThanOrEqual(LAKE_SHAPE.slope);
		expect(bound).toBeGreaterThan(1000);
		expect(boundSteepest).toBeLessThanOrEqual(TERRAIN_MAX_SLOPE);
	});

	test('the drawn depth deepens linearly to its maximum', () => {
		expect(lakeDepthAt(-5)).toBe(0);
		expect(lakeDepthAt(0)).toBe(0);
		expect(lakeDepthAt(LAKE_SHAPE.depthRampMetres / 2)).toBeCloseTo(LAKE_SHAPE.depthMetres / 2, 9);
		expect(lakeDepthAt(1e6)).toBe(LAKE_SHAPE.depthMetres);
		expect(lakeLevel(0.5, 0.5)).toBe(0.25);
	});
});
