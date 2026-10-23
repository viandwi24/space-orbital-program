/** Plan 044 / ADR 0054: the moon's height function - bounds, determinism, the plain, relief, slope. */
import { describe, expect, test } from 'bun:test';
import {
	createMoonTerrainField,
	MOON_MAX_HEIGHT,
	MOON_MAX_SLOPE,
	MOON_SHAPE,
	SMALL_SHAPE,
	moonHeight,
	createRng,
	type Vec3
} from '../src/index.ts';

const RADIUS = 190_000;
const unit = (x: number, y: number, z: number): Vec3 => {
	const l = Math.hypot(x, y, z);
	return { x: x / l, y: y / l, z: z / l };
};
const randomDirection = (rng: () => number): Vec3 =>
	unit(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);

describe('moon terrain', () => {
	const rng = createRng(7);
	const samples = Array.from({ length: 6_000 }, () => randomDirection(() => rng.next()));

	test('every height is inside [0, MOON_MAX_HEIGHT] and the same twice', () => {
		const field = createMoonTerrainField({ radius: RADIUS });
		let lo = Infinity;
		let hi = -Infinity;
		for (const n of samples) {
			const h = field.heightAt(n);
			lo = Math.min(lo, h);
			hi = Math.max(hi, h);
			expect(field.heightAt(n)).toBe(h);
		}
		console.log(`moon heights ${lo.toFixed(0)} to ${hi.toFixed(0)} m`);
		expect(lo).toBeGreaterThanOrEqual(0);
		expect(hi).toBeLessThanOrEqual(MOON_MAX_HEIGHT);
		expect(field.maxHeight).toBe(MOON_MAX_HEIGHT);
	});

	test('the landing site is a flat plain and craters start beyond it', () => {
		const here = (arc: number, angle: number): number =>
			moonHeight(
				unit(
					Math.cos(arc / RADIUS),
					Math.sin(arc / RADIUS) * Math.cos(angle),
					Math.sin(arc / RADIUS) * Math.sin(angle)
				),
				RADIUS
			);
		for (let a = 0; a < 6.3; a += 0.3) {
			expect(here(0, 0)).toBe(MOON_SHAPE.base);
			expect(here(MOON_SHAPE.plainFrom - 100, a)).toBe(MOON_SHAPE.base);
		}
		// Relief: far from the plain the spread of heights is that of craters, hundreds of metres.
		const far = samples
			.filter((n) => RADIUS * Math.acos(n.x) > 60_000)
			.map((n) => moonHeight(n, RADIUS));
		const mean = far.reduce((a, b) => a + b, 0) / far.length;
		const spread = Math.sqrt(far.reduce((a, b) => a + (b - mean) ** 2, 0) / far.length);
		expect(spread).toBeGreaterThan(150);
		expect(far.some((h) => h < MOON_SHAPE.base - 1_000)).toBe(true); // a deep bowl
		expect(far.some((h) => h > MOON_SHAPE.base + 300)).toBe(true); // a rim or a hill
	});

	test(`the slope never exceeds ${MOON_MAX_SLOPE} (4 m baseline, 4 000 directions)`, () => {
		let worst = 0;
		for (const n of samples.slice(0, 4_000)) {
			const e = unit(-n.z, 0, n.x); // a tangent
			const step = 4 / RADIUS;
			const a = moonHeight(unit(n.x + e.x * step, n.y, n.z + e.z * step), RADIUS);
			const b = moonHeight(unit(n.x - e.x * step, n.y, n.z - e.z * step), RADIUS);
			worst = Math.max(worst, Math.abs(a - b) / 8);
		}
		console.log(`moon steepest slope ${worst.toFixed(3)}`);
		expect(worst).toBeLessThanOrEqual(MOON_MAX_SLOPE);
	});
});

describe('small-body terrain (ADR 0320)', () => {
	const R = 9_000;
	const rng = createRng(11);
	const samples = Array.from({ length: 4_000 }, () => randomDirection(() => rng.next()));
	const field = createMoonTerrainField({ radius: R, seed: 41, small: true });

	test('the moon rule would make a 9 km body one flat plain; the small shape has relief all over it', () => {
		// within 2.9 km of the landing site (the plain is 10 km wide at least)
		for (const n of samples.filter((n) => n.x > 0.95).slice(0, 200)) expect(moonHeight(n, R, 41)).toBe(MOON_SHAPE.base);
		const h = samples.map((n) => field.heightAt(n));
		const mean = h.reduce((a, b) => a + b, 0) / h.length;
		const sd = Math.sqrt(h.reduce((a, b) => a + (b - mean) ** 2, 0) / h.length);
		expect(sd).toBeGreaterThan(0.03 * R);
		expect(Math.max(...h) - Math.min(...h)).toBeGreaterThan(0.25 * R);
	});

	test('every height is inside [0, maxShare * radius], deterministic, and the field says so', () => {
		const max = SMALL_SHAPE.maxShare * R;
		expect(field.maxHeight).toBe(max);
		for (const n of samples) {
			const h = field.heightAt(n);
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThanOrEqual(max);
			expect(field.heightAt(n)).toBe(h);
		}
	});

	test('craters scale with the radius: a body twice as large has the same shape twice as big', () => {
		const big = createMoonTerrainField({ radius: 2 * R, seed: 41, small: true });
		for (const n of samples.slice(0, 300)) {
			const a = field.heightAt(n);
			const b = big.heightAt(n);
			expect(Math.abs(2 * a - b)).toBeLessThan(1e-6 * R + 1e-9 * b);
		}
	});

	test('another seed is another rock, and the slope stays walkable', () => {
		const other = createMoonTerrainField({ radius: R, seed: 42, small: true });
		let differ = 0;
		let worst = 0;
		const step = 10 / R;
		for (const n of samples.slice(0, 1_500)) {
			if (Math.abs(other.heightAt(n) - field.heightAt(n)) > 10) differ++;
			const e = unit(-n.z, 0, n.x);
			const a = field.heightAt(unit(n.x + e.x * step, n.y, n.z + e.z * step));
			const b = field.heightAt(unit(n.x - e.x * step, n.y, n.z - e.z * step));
			worst = Math.max(worst, Math.abs(a - b) / (2 * 10));
		}
		expect(differ).toBeGreaterThan(1_000);
		console.log(`small body worst slope ${worst.toFixed(3)}`);
		expect(worst).toBeLessThan(1);
	});
});
