/** Plan 125 / ADR 0122: the n-body integrator against the Kepler limit, the Jacobi constant and L4. */
import { describe, expect, test } from 'bun:test';
import {
	fromStateVector,
	integrateNBody,
	propagate,
	type NBodyField,
	type StateVector,
	type Vec3
} from '../src/index.ts';

// the stock home planet and its moon, rounded
const MU_HOME = 3.5316e12;
const MU_MOON = 6.5138398e10;
const A = 12_000_000;

const rel = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / Math.hypot(b.x, b.y, b.z);

describe('the Kepler limit', () => {
	test('with every perturber at μ = 0 the path is the conic to 1e-6 after 10 orbits', () => {
		const field: NBodyField = { mu: MU_HOME, perturbers: [{ mu: 0, at: () => ({ x: A, y: 0, z: 0 }) }] };
		const start: StateVector = { r: { x: 700_000, y: 0, z: 0 }, v: { x: 0, y: 0, z: 2_400 } };
		const el = fromStateVector(start.r, start.v, MU_HOME, 0);
		const period = 2 * Math.PI * Math.sqrt(el.a ** 3 / MU_HOME);
		const end = integrateNBody(field, start, 0, 10 * period);
		const conic = propagate(el, MU_HOME, 10 * period);
		expect(rel(end.r, conic.r)).toBeLessThan(1e-6);
		expect(rel(end.v, conic.v)).toBeLessThan(1e-6);
	});
});

/** The moon on a circular orbit about the barycentre, relative to the planet (the CR3BP). */
const n = Math.sqrt((MU_HOME + MU_MOON) / A ** 3);
const moonAt = (t: number): Vec3 => ({ x: A * Math.cos(n * t), y: 0, z: -A * Math.sin(n * t) });
const field: NBodyField = { mu: MU_HOME, perturbers: [{ mu: MU_MOON, at: moonAt }] };
const bary = MU_MOON / (MU_HOME + MU_MOON); // the barycentre's share of the planet–moon vector

/** Jacobi constant (dimensional) of a planet-frame state at `t`. */
function jacobi(s: StateVector, t: number): number {
	const m = moonAt(t);
	const mv = { x: -A * n * Math.sin(n * t), y: 0, z: -A * n * Math.cos(n * t) };
	// barycentric inertial
	const r = { x: s.r.x - bary * m.x, y: s.r.y - bary * m.y, z: s.r.z - bary * m.z };
	const v = { x: s.v.x - bary * mv.x, y: s.v.y - bary * mv.y, z: s.v.z - bary * mv.z };
	// the rotation is about +Y with angular velocity ω = (0, n, 0): moon at (cos nt, 0, −sin nt)
	const w = { x: 0, y: n, z: 0 };
	const vr = { x: v.x - (w.y * r.z - w.z * r.y), y: v.y - (w.z * r.x - w.x * r.z), z: v.z - (w.x * r.y - w.y * r.x) };
	const r1 = Math.hypot(s.r.x, s.r.y, s.r.z);
	const r2 = Math.hypot(s.r.x - m.x, s.r.y - m.y, s.r.z - m.z);
	const planar = r.x * r.x + r.z * r.z;
	return n * n * planar + 2 * (MU_HOME / r1 + MU_MOON / r2) - (vr.x ** 2 + vr.y ** 2 + vr.z ** 2);
}

describe('the circular restricted three-body problem', () => {
	test('the Jacobi constant stays within 1e-8 over 100 days', () => {
		const start: StateVector = { r: { x: 2_500_000, y: 300_000, z: 0 }, v: { x: 0, y: 0, z: -1_250 } };
		const c0 = jacobi(start, 0);
		let s = start;
		let h: number | undefined;
		const DAY = 86_400;
		for (let d = 0; d < 100; d++) {
			const r = integrateNBody(field, s, d * DAY, (d + 1) * DAY, h ? { step: h } : {});
			s = r;
			h = r.h;
		}
		expect(Math.abs(jacobi(s, 100 * DAY) - c0) / Math.abs(c0)).toBeLessThan(1e-8);
	});

	test('an object at L4 stays within 1 % of the moon distance of L4 for 10 moon orbits', () => {
		// L4 leads the moon by 60° at distance A from the planet (an equilateral triangle) and turns with
		// the planet–moon line, so relative to the planet it is r = A (cos, 0, −sin)(nt + 60°), v = ω × r
		const l4 = (t: number): Vec3 => ({
			x: A * Math.cos(n * t + Math.PI / 3),
			y: 0,
			z: -A * Math.sin(n * t + Math.PI / 3)
		});
		const r0 = l4(0);
		const start: StateVector = { r: r0, v: { x: n * r0.z, y: 0, z: -n * r0.x } };
		const period = (2 * Math.PI) / n;
		let s = start;
		let worst = 0;
		for (let k = 1; k <= 100; k++) {
			s = integrateNBody(field, s, ((k - 1) * period) / 10, (k * period) / 10);
			const want = l4((k * period) / 10);
			worst = Math.max(worst, Math.hypot(s.r.x - want.x, s.r.y - want.y, s.r.z - want.z));
		}
		expect(worst / A).toBeLessThan(0.01);
	});
});

describe('dense output', () => {
	test('quintic Hermite between two steps of a low orbit is within a few centimetres', async () => {
		const { hermiteState, nBodyAcceleration, nBodyStep } = await import('../src/index.ts');
		const start: StateVector = { r: { x: 700_000, y: 0, z: 0 }, v: { x: 0, y: 0, z: -2_246 } };
		const step = nBodyStep(field, start, 0, 120);
		const a = { ...start, acc: nBodyAcceleration(field, 0, start.r), t: 0 };
		const b = { r: step.r, v: step.v, acc: nBodyAcceleration(field, step.step, step.r), t: step.step };
		for (const f of [0.1, 0.37, 0.5, 0.9]) {
			const t = f * step.step;
			const exact = integrateNBody(field, start, 0, t);
			const dense = hermiteState(a, b, t);
			expect(Math.hypot(dense.r.x - exact.r.x, dense.r.y - exact.r.y, dense.r.z - exact.r.z)).toBeLessThan(0.05);
		}
	});
});
