/** Plan 052 / ADR 0068, moved to core by plan 060 (ADR 0092): stones are pure hashing of a world-fixed lattice - determinism, budget, placement, instances. */
import { describe, expect, test } from 'bun:test';
import { createRng } from '../src/rng.ts';
import type { Vec3 } from '../src/math.ts';
import {
	bodyHasStones,
	chartDirection,
	chartOf,
	stoneCollider,
	stoneInCell,
	stonesAround,
	STONES
} from '../src/stones.ts';

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const normalize = (v: Vec3): Vec3 => {
	const l = Math.hypot(v.x, v.y, v.z);
	return vec(v.x / l, v.y / l, v.z / l);
};
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

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

describe('seed, bodies and collision shape (plan 060)', () => {
	test('seed 0 is the lattice every body had; another seed gives another pattern, each deterministic', () => {
		const a = stonesAround(landing, R, 40, 1024, 0);
		expect(JSON.stringify(a)).toBe(
			JSON.stringify(stonesAround(landing, R, 40, STONES.maxInstances))
		);
		const b = stonesAround(landing, R, 40, 1024, 7);
		expect(JSON.stringify(b)).toBe(JSON.stringify(stonesAround(landing, R, 40, 1024, 7)));
		expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
	});

	test('only a craters body has stones', () => {
		expect(bodyHasStones({ terrain: { kind: 'craters' } })).toBe(true);
		expect(bodyHasStones({ terrain: { kind: 'hills' } })).toBe(false);
		expect(bodyHasStones({})).toBe(false);
	});

	test('the collision sphere has the drawn dome as its cap', () => {
		for (const radius of [0.16, 0.5, 1.2, 1.49]) {
			const c = stoneCollider({ radius });
			const top = c.centreHeight + c.radius;
			expect(top).toBeCloseTo(STONES.flatten * (1 - STONES.sink) * radius, 9);
			// where the sphere meets the ground its half-width is the stone's radius
			expect(Math.sqrt(c.radius ** 2 - c.centreHeight ** 2)).toBeCloseTo(radius, 9);
			expect(c.centreHeight).toBeLessThan(0);
		}
	});
});
