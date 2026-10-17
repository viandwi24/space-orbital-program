/** Plan 052 / ADR 0068: stones are pure hashing of a world-fixed lattice - determinism, budget, placement, instances. */
import { describe, expect, test } from 'bun:test';
import { createRng, type Vec3 } from '@orbital/core';
import { MoonStones, NEAR_CAPACITY } from '../src/moon-stones.ts';
import { moonFragmentBump, moonFragmentCommon } from '../src/shaders/moon.glsl.ts';
import { chartDirection, chartOf, stoneInCell, stonesAround, STONES } from '../src/stones-model.ts';
import { patchFrame } from '../src/terrain-patch.ts';
import { dot, normalize, vec } from '../src/vec.ts';
import { MeshDepthMaterial, MeshLambertMaterial } from 'three';

const R = 190_000;
const landing = vec(1, 0, 0);
const rng = createRng(3);
const randomDirection = (): Vec3 =>
	normalize(vec(rng.next() * 2 - 1, rng.next() * 2 - 1, rng.next() * 2 - 1));

describe('the chart', () => {
	test('direction and chart coordinates round-trip on every face', () => {
		for (let k = 0; k < 600; k++) {
			const n = randomDirection();
			const back = chartDirection(chartOf(n, R), R);
			expect(dot(n, back)).toBeGreaterThan(1 - 1e-12);
		}
	});

	test('near the middle of a face a chart metre is a metre of ground', () => {
		const a = chartOf(landing, R);
		const b = chartOf(normalize(vec(1, 0, 100 / R)), R);
		expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(100, 2);
	});
});

describe('stones', () => {
	test('the same place gives the same stones, byte for byte', () => {
		const a = stonesAround(landing, R);
		const b = stonesAround(landing, R);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		expect(a.length).toBeGreaterThan(0);
	});

	test('a stone is the same wherever it is looked at from', () => {
		const here = stonesAround(landing, R);
		const near = normalize(vec(1, 0, 20 / R)); // 20 m away
		const there = stonesAround(near, R);
		const key = (s: { face: number; i: number; j: number }): string => `${s.face}:${s.i}:${s.j}`;
		const byKey = new Map(there.map((s) => [key(s), s]));
		let shared = 0;
		for (const s of here) {
			const t = byKey.get(key(s));
			if (!t) continue;
			shared++;
			expect(t).toEqual(s);
		}
		expect(shared).toBeGreaterThan(here.length / 2);
	});

	test('cells are decided by their hash alone and match stonesAround', () => {
		const c = chartOf(landing, R);
		const list = stonesAround(landing, R, 30);
		const i0 = Math.floor(c.x / STONES.cell);
		const j0 = Math.floor(c.y / STONES.cell);
		for (const s of list) {
			expect(stoneInCell(s.face, s.i, s.j, R)).toEqual(s);
		}
		// an explicit scan finds nothing that stonesAround missed inside its radius
		let found = 0;
		for (let j = j0 - 20; j <= j0 + 20; j++) {
			for (let i = i0 - 20; i <= i0 + 20; i++) {
				const s = stoneInCell(c.face, i, j, R);
				if (s && Math.hypot(s.x - c.x, s.y - c.y) <= 30) found++;
			}
		}
		expect(found).toBe(list.length);
	});

	test('stones are sized, placed inside their cells and sorted nearest first', () => {
		const c = chartOf(landing, R);
		const list = stonesAround(landing, R);
		let last = 0;
		for (const s of list) {
			expect(s.radius).toBeGreaterThanOrEqual(STONES.radiusMin);
			expect(s.radius).toBeLessThanOrEqual(
				(STONES.radiusMin + STONES.radiusSpan) * STONES.boulderScale + 1e-9
			);
			expect(s.x).toBeGreaterThanOrEqual(s.i * STONES.cell);
			expect(s.x).toBeLessThan((s.i + 1) * STONES.cell);
			expect(s.y).toBeGreaterThanOrEqual(s.j * STONES.cell);
			expect(s.y).toBeLessThan((s.j + 1) * STONES.cell);
			const d = Math.hypot(s.x - c.x, s.y - c.y);
			expect(d).toBeLessThanOrEqual(STONES.instanceRadius);
			expect(d).toBeGreaterThanOrEqual(last - 1e-9);
			last = d;
		}
	});

	test('the budget: never above maxInstances anywhere, and a busy ground fills a good share of it', () => {
		let most = 0;
		let total = 0;
		const n = 300;
		for (let k = 0; k < n; k++) {
			const count = stonesAround(randomDirection(), R).length;
			expect(count).toBeLessThanOrEqual(STONES.maxInstances);
			most = Math.max(most, count);
			total += count;
		}
		console.log(
			`stones within ${STONES.instanceRadius} m: mean ${(total / n).toFixed(0)}, most ${most}`
		);
		expect(total / n).toBeGreaterThan(80);
		expect(most).toBeGreaterThan(300);
		// a cap smaller than the field keeps the nearest
		const capped = stonesAround(landing, R, STONES.instanceRadius, 10);
		const full = stonesAround(landing, R);
		expect(capped).toEqual(full.slice(0, 10));
	});
});

describe('the GLSL twin carries the constants', () => {
	test('lattice and size constants are in the shader source', () => {
		const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));
		for (const k of [
			STONES.cell,
			STONES.regionCells,
			STONES.quiet,
			STONES.busy,
			STONES.radiusMin,
			STONES.radiusSpan,
			STONES.boulderScale,
			STONES.flatten * (1 - STONES.sink)
		]) {
			expect(moonFragmentCommon).toContain(f(k));
		}
		expect(moonFragmentCommon).toContain(String(STONES.salt));
		expect(moonFragmentBump).toContain('stoneDomes(vMoonN)');
	});
});

describe('the instanced stones', () => {
	const frame = patchFrame(landing, R, 2_048);
	const make = (): MoonStones =>
		new MoonStones(R, new MeshLambertMaterial(), new MeshDepthMaterial());

	test('they appear near the ground, in two meshes with the near one capped, and not high up', () => {
		const stones = make();
		stones.update(landing, 5, null);
		expect(stones.near.visible).toBe(false); // the fine patch is not baked yet
		stones.update(landing, 5, frame);
		expect(stones.near.visible && stones.far.visible).toBe(true);
		expect(stones.count).toBeGreaterThan(50);
		const nearCount = (stones.near.geometry as unknown as { instanceCount: number }).instanceCount;
		const farCount = (stones.far.geometry as unknown as { instanceCount: number }).instanceCount;
		expect(nearCount).toBeGreaterThan(0);
		expect(nearCount).toBeLessThanOrEqual(NEAR_CAPACITY);
		expect(nearCount + farCount).toBe(stones.count);
		expect(stones.count).toBeLessThanOrEqual(STONES.maxInstances);
		stones.update(landing, STONES.maxAltitude + 10, frame);
		expect(stones.near.visible).toBe(false);
		expect(stones.far.visible).toBe(false);
	});

	test('the list is kept while the camera moves a little and rebuilt after the refresh distance', () => {
		const stones = make();
		stones.update(landing, 5, frame);
		const attribute = stones.far.geometry.getAttribute('aStone');
		const before = attribute.getX(0);
		stones.update(normalize(vec(1, 0, 2 / R)), 5, frame); // 2 m: kept
		expect(attribute.getX(0)).toBe(before);
		stones.update(normalize(vec(1, 0, (STONES.refreshDistance + 2) / R)), 5, frame);
		expect(attribute.getX(0)).not.toBe(before);
	});
});
